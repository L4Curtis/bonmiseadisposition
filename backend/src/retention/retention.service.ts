import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { AttachmentsService } from '../attachments/attachments.service';

const DEFAULT_ANONYMIZE_MONTHS = 36; // 3 ans par défaut (rétention légale usuelle)
const SIGNATURES_DIR = path.join(process.cwd(), 'data', 'signatures');

export interface RetentionResult {
  eligible: number;
  anonymized: number;
  attachmentsPurged: number;
  cutoff: string;
  dryRun: boolean;
}

/**
 * Rétention RGPD : au-delà d'une durée configurable, les bons CLÔTURÉS
 * (archived) ou ANNULÉS (cancelled) voient leurs données personnelles purgées
 * et leurs preuves détruites — la durée légale de conservation expirée, on doit
 * effacer. La ligne du bon subsiste (référence, dates, statut, modèles
 * d'équipement) comme enregistrement statistique anonyme.
 *
 * Désactivé par défaut (config 'retention'.enabled = 'true' pour activer).
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly attachments: AttachmentsService,
  ) {}

  private async getMonths(key: string, fallback: number): Promise<number> {
    const raw = await this.config.get('retention', key);
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(600, parsed); // borne haute 50 ans
  }

  private cutoffDate(months: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d;
  }

  /** Bons éligibles à l'anonymisation (archivés/annulés, anciens, non déjà anonymisés). */
  private async findEligible(cutoff: Date) {
    return this.prisma.bon.findMany({
      where: {
        status: { in: ['archived', 'cancelled'] },
        anonymizedAt: null,
        updatedAt: { lt: cutoff },
      },
      select: { id: true, reference: true },
      take: 500, // par lot, pour ne pas saturer un run
    });
  }

  /** Prévisualisation : combien de bons seraient anonymisés (aucune modification). */
  async preview(): Promise<RetentionResult> {
    const months = await this.getMonths('anonymize_months', DEFAULT_ANONYMIZE_MONTHS);
    const cutoff = this.cutoffDate(months);
    const eligible = await this.prisma.bon.count({
      where: {
        status: { in: ['archived', 'cancelled'] },
        anonymizedAt: null,
        updatedAt: { lt: cutoff },
      },
    });
    return { eligible, anonymized: 0, attachmentsPurged: 0, cutoff: cutoff.toISOString(), dryRun: true };
  }

  /** Exécute l'anonymisation. dryRun=true ne fait que compter. */
  async run(dryRun = false, triggeredByEmail?: string): Promise<RetentionResult> {
    const months = await this.getMonths('anonymize_months', DEFAULT_ANONYMIZE_MONTHS);
    const cutoff = this.cutoffDate(months);
    const eligible = await this.findEligible(cutoff);

    if (dryRun) {
      return { eligible: eligible.length, anonymized: 0, attachmentsPurged: 0, cutoff: cutoff.toISOString(), dryRun: true };
    }

    let anonymized = 0;
    let attachmentsPurged = 0;
    for (const bon of eligible) {
      try {
        attachmentsPurged += await this.anonymizeBon(bon.id);
        anonymized++;
      } catch (err) {
        this.logger.error(`Échec anonymisation bon ${bon.reference}: ${(err as Error).message}`);
      }
    }

    if (anonymized > 0) {
      this.logger.warn(
        `Rétention RGPD : ${anonymized} bon(s) anonymisé(s), ${attachmentsPurged} pièce(s) jointe(s) purgée(s) (cutoff ${cutoff.toISOString().slice(0, 10)})`,
      );
    }
    return { eligible: eligible.length, anonymized, attachmentsPurged, cutoff: cutoff.toISOString(), dryRun: false };
  }

  /** Anonymise un bon : purge PII + détruit les preuves (PDF, archives, signatures). */
  private async anonymizeBon(bonId: string): Promise<number> {
    // 1. Fichiers de signature chiffrés sur disque
    const sigs = await this.prisma.signature.findMany({
      where: { bonId, signatureImagePath: { not: null } },
      select: { signatureImagePath: true },
    });
    for (const s of sigs) {
      if (!s.signatureImagePath) continue;
      const basename = path.basename(s.signatureImagePath);
      const full = path.join(SIGNATURES_DIR, basename);
      if (full.startsWith(SIGNATURES_DIR) && fs.existsSync(full)) {
        await unlink(full).catch(() => { /* best-effort */ });
      }
    }

    // 2. Pièces jointes (fichiers + lignes)
    const attachmentsPurged = await this.attachments.purgeForBon(bonId);

    // 3. Transaction : purge PII + preuves en base, marque anonymisé
    await this.prisma.$transaction(async (tx) => {
      await tx.signature.updateMany({
        where: { bonId },
        data: {
          signerEmail: null,
          signerIp: null,
          signerUserAgent: null,
          signatureImagePath: null,
        },
      });
      // Preuves binaires (contiennent noms/emails/signatures) — durée légale expirée
      await tx.pdfSnapshot.deleteMany({ where: { bonId } });
      await tx.proofArchive.deleteMany({ where: { bonId } });
      // Anonymise les champs personnels du bon (conserve réf/dates/statut)
      await tx.bon.update({
        where: { id: bonId },
        data: {
          collaborateurEmail: 'anonymise@rgpd.local',
          notes: null,
          pdfMiseDispoSnapshot: null,
          pdfRestitutionSnapshot: null,
          anonymizedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: { bonId, action: 'bon_anonymized', details: { reason: 'retention_rgpd' } },
      });
    });

    return attachmentsPurged;
  }

  /** Cron hebdomadaire (dimanche 03h) — anonymisation si la rétention est activée. */
  @Cron('0 3 * * 0')
  async cronRetention(): Promise<void> {
    try {
      const enabled = await this.config.get('retention', 'enabled');
      if (enabled !== 'true') return;
      this.logger.log('Cron rétention RGPD : démarrage');
      const result = await this.run(false);
      this.logger.log(`Cron rétention RGPD terminé : ${result.anonymized}/${result.eligible} anonymisé(s)`);
      // Nettoyage technique complémentaire (tokens abandonnés, vieux journaux d'audit)
      const tech = await this.purgeTechnical();
      this.logger.log(`Purge technique : ${tech.expiredTokens} token(s), ${tech.oldAuditLogs} log(s) d'audit`);
    } catch (err) {
      this.logger.error(`Cron rétention RGPD en échec: ${(err as Error).stack ?? err}`);
    }
  }

  // ─── Purge technique : tokens de signature expirés & vieux logs d'audit ──────
  // Complémentaire de l'anonymisation ci-dessus : nettoyage courant des données
  // techniques (tokens abandonnés, journaux d'audit au-delà de la durée légale).

  /**
   * Supprime les signatures dont le token est expiré depuis plus de N jours et
   * qui n'ont jamais été signées (tokens abandonnés).
   * Config 'retention'.expired_tokens_days (défaut 30).
   */
  async purgeExpiredTokens(): Promise<number> {
    const daysStr = await this.config.get('retention', 'expired_tokens_days');
    const days = parseInt(daysStr || '30', 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await this.prisma.signature.deleteMany({
      where: { signed: false, tokenExpiresAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(
        `Purge tokens expirés : ${result.count} signature(s) non signée(s) supprimée(s) (expirées avant ${cutoff.toISOString()})`,
      );
    }
    return result.count;
  }

  /**
   * Supprime les logs d'audit plus anciens que N années.
   * Config 'retention'.audit_logs_years (défaut 5).
   */
  async purgeOldAuditLogs(): Promise<number> {
    const yearsStr = await this.config.get('retention', 'audit_logs_years');
    const years = parseInt(yearsStr || '5', 10);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);

    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(
        `Purge audit logs : ${result.count} entrée(s) supprimée(s) (antérieures au ${cutoff.toISOString()})`,
      );
    }
    return result.count;
  }

  /** Exécute les deux purges techniques et retourne les compteurs. */
  async purgeTechnical(): Promise<{ expiredTokens: number; oldAuditLogs: number }> {
    const [expiredTokens, oldAuditLogs] = await Promise.all([
      this.purgeExpiredTokens(),
      this.purgeOldAuditLogs(),
    ]);
    return { expiredTokens, oldAuditLogs };
  }

  /** Statistiques de rétention technique pour le dashboard admin. */
  async getRetentionStats() {
    const daysStr = await this.config.get('retention', 'expired_tokens_days');
    const yearsStr = await this.config.get('retention', 'audit_logs_years');
    const enabled = await this.config.get('retention', 'enabled');

    const days = parseInt(daysStr || '30', 10);
    const years = parseInt(yearsStr || '5', 10);

    const tokenCutoff = new Date();
    tokenCutoff.setDate(tokenCutoff.getDate() - days);

    const auditCutoff = new Date();
    auditCutoff.setFullYear(auditCutoff.getFullYear() - years);

    const [expiredTokenCount, oldAuditCount, totalAuditCount, totalSignatureCount] =
      await Promise.all([
        this.prisma.signature.count({
          where: { signed: false, tokenExpiresAt: { lt: tokenCutoff } },
        }),
        this.prisma.auditLog.count({ where: { createdAt: { lt: auditCutoff } } }),
        this.prisma.auditLog.count(),
        this.prisma.signature.count(),
      ]);

    return {
      enabled: enabled === 'true',
      config: { expiredTokensDays: days, auditLogsYears: years },
      purgeable: { expiredTokens: expiredTokenCount, oldAuditLogs: oldAuditCount },
      totals: { auditLogs: totalAuditCount, signatures: totalSignatureCount },
    };
  }
}
