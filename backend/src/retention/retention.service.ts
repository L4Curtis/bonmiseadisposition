import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { AttachmentsService } from '../attachments/attachments.service';

const DEFAULT_ANONYMIZE_MONTHS = 60; // 5 ans par défaut — plancher légal RGPD
const ANONYMIZE_MONTHS_FLOOR = 60; // Plancher légal : aucune config ne peut descendre en dessous
const DEFAULT_ATTACHMENT_MONTHS = 24; // Purge indépendante des pièces jointes (défaut raisonnable, non légalement fixé)
const SIGNATURES_DIR = path.join(process.cwd(), 'data', 'signatures');
// Chemin de stockage des pièces jointes — recopié depuis AttachmentsService
// (UPLOADS_DIR y est privé, non exporté). À synchroniser si ce chemin change.
const ATTACHMENTS_DIR = path.join(process.cwd(), 'data', 'attachments');
const ANONYMIZED_EMAIL = 'anonymise@rgpd.local';
// Clés JSON pouvant contenir des PII dans AuditLog.details, retirées à l'anonymisation
// — 'message' : bon_contested stocke message.substring(0,200) (texte libre du collaborateur)
// — 'reason' : declare_not_returned / bon_closed_unilateral stockent un motif libre
const AUDIT_DETAILS_PII_KEYS = ['filename', 'titulaireEmail', 'signerEmail', 'email', 'message', 'reason'];
const DRY_RUN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export interface RetentionResult {
  eligible: number;
  anonymized: number;
  /** Pièces jointes purgées avec les bons anonymisés dans ce run */
  attachmentsPurged: number;
  /** Pièces jointes purgées séparément (retention.attachment_months), indépendamment de l'anonymisation */
  oldAttachmentsPurged: number;
  cutoff: string;
  dryRun: boolean;
}

/** Retire du JSON `details` d'un AuditLog les clés pouvant porter des PII. */
function sanitizeAuditDetails(details: Prisma.JsonValue): Prisma.JsonValue {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return details;
  let changed = false;
  const clone: Record<string, Prisma.JsonValue> = { ...(details as Record<string, Prisma.JsonValue>) };
  for (const key of AUDIT_DETAILS_PII_KEYS) {
    if (key in clone) {
      delete clone[key];
      changed = true;
    }
  }
  return changed ? clone : details;
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

  /**
   * Lit une durée en mois depuis la config 'retention'.<key>, avec un
   * plancher optionnel (ex: le plancher légal de 60 mois pour
   * anonymize_months) : toute valeur — configurée OU par défaut — en dessous
   * du plancher est relevée, avec un avertissement (une faute de saisie du
   * type "3" ne doit jamais détruire des preuves à 3 mois).
   */
  private async getMonths(key: string, fallback: number, floor?: number): Promise<number> {
    const raw = await this.config.get('retention', key);
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    let months = !Number.isFinite(parsed) || parsed < 1 ? fallback : Math.min(600, parsed); // borne haute 50 ans
    if (floor !== undefined && months < floor) {
      this.logger.warn(
        `retention.${key} = ${months} mois est inférieur au plancher légal de ${floor} mois — ${floor} mois appliqués`,
      );
      months = floor;
    }
    return months;
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

  private async countOldAttachments(cutoff: Date): Promise<number> {
    return this.prisma.attachment.count({
      where: { bon: { status: { in: ['archived', 'cancelled'] }, updatedAt: { lt: cutoff } } },
    });
  }

  /** Prévisualisation : combien de bons seraient anonymisés (aucune modification). */
  async preview(): Promise<RetentionResult> {
    const months = await this.getMonths('anonymize_months', DEFAULT_ANONYMIZE_MONTHS, ANONYMIZE_MONTHS_FLOOR);
    const cutoff = this.cutoffDate(months);
    const eligible = await this.prisma.bon.count({
      where: {
        status: { in: ['archived', 'cancelled'] },
        anonymizedAt: null,
        updatedAt: { lt: cutoff },
      },
    });
    const attachmentMonths = await this.getMonths('attachment_months', DEFAULT_ATTACHMENT_MONTHS);
    const oldAttachmentsPurged = await this.countOldAttachments(this.cutoffDate(attachmentMonths));
    return {
      eligible,
      anonymized: 0,
      attachmentsPurged: 0,
      oldAttachmentsPurged,
      cutoff: cutoff.toISOString(),
      dryRun: true,
    };
  }

  /**
   * Exécute l'anonymisation. dryRun=true ne fait que compter (et marque un
   * "dry-run récent" — condition requise pour que trigger='manual' puisse
   * lancer un run réel juste après, cf. run() ci-dessous).
   *
   * `trigger` distingue un déclenchement manuel (admin, via le contrôleur) du
   * cron hebdomadaire : seul le déclenchement manuel est soumis au garde-fou
   * "dry-run de moins de 24h" — le cron est un traitement automatisé et
   * planifié, pas un geste d'un opérateur qu'il faut forcer à prévisualiser
   * avant d'exécuter.
   */
  async run(
    dryRun = false,
    triggeredByEmail?: string,
    trigger: 'manual' | 'cron' = 'manual',
  ): Promise<RetentionResult> {
    if (dryRun) {
      await this.config.set('system', 'retention_last_dry_run', new Date().toISOString());
    } else if (trigger === 'manual') {
      const lastDryRunRaw = await this.config.get('system', 'retention_last_dry_run');
      const lastDryRun = lastDryRunRaw ? new Date(lastDryRunRaw) : null;
      if (!lastDryRun || Number.isNaN(lastDryRun.getTime()) || Date.now() - lastDryRun.getTime() > DRY_RUN_MAX_AGE_MS) {
        throw new BadRequestException(
          "Un aperçu (dry-run) de moins de 24h est requis avant d'exécuter la rétention réellement.",
        );
      }
    }

    const months = await this.getMonths('anonymize_months', DEFAULT_ANONYMIZE_MONTHS, ANONYMIZE_MONTHS_FLOOR);
    const cutoff = this.cutoffDate(months);
    const eligible = await this.findEligible(cutoff);

    const attachmentMonths = await this.getMonths('attachment_months', DEFAULT_ATTACHMENT_MONTHS);
    const attachmentCutoff = this.cutoffDate(attachmentMonths);

    if (dryRun) {
      const oldAttachmentsPurged = await this.countOldAttachments(attachmentCutoff);
      return {
        eligible: eligible.length,
        anonymized: 0,
        attachmentsPurged: 0,
        oldAttachmentsPurged,
        cutoff: cutoff.toISOString(),
        dryRun: true,
      };
    }

    let anonymized = 0;
    let attachmentsPurged = 0;
    for (const bon of eligible) {
      try {
        attachmentsPurged += await this.anonymizeBon(bon.id, triggeredByEmail);
        anonymized++;
      } catch (err) {
        this.logger.error(
          `Échec anonymisation bon ${bon.reference}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }

    // Purge complémentaire (retention.attachment_months) : pièces jointes de
    // bons clôturés/annulés anciens, indépendamment de leur anonymisation
    // complète (qui suit un délai plus long, cf. plancher légal ci-dessus).
    const oldAttachmentsPurged = await this.purgeOldAttachments(attachmentCutoff);
    // Tokens de signature abandonnés — inclus ici pour que l'audit retention_run
    // porte un résumé complet du run (le cron ne relance plus cette purge).
    const purgedTokens = await this.purgeExpiredTokens();

    if (anonymized > 0 || oldAttachmentsPurged > 0 || purgedTokens > 0) {
      this.logger.warn(
        `Rétention RGPD : ${anonymized} bon(s) anonymisé(s) (${attachmentsPurged} pièce(s) jointe(s) associée(s) purgée(s)), ` +
        `${oldAttachmentsPurged} pièce(s) jointe(s) ancienne(s) purgée(s), ${purgedTokens} token(s) expiré(s) purgé(s) ` +
        `(cutoff anonymisation ${cutoff.toISOString().slice(0, 10)})`,
      );
    }

    await this.prisma.auditLog.create({
      data: {
        userEmail: triggeredByEmail ?? null,
        action: 'retention_run',
        details: {
          trigger,
          anonymized,
          purgedTokens,
          purgedAttachments: attachmentsPurged + oldAttachmentsPurged,
          dryRun: false,
        },
      },
    });

    return {
      eligible: eligible.length,
      anonymized,
      attachmentsPurged,
      oldAttachmentsPurged,
      cutoff: cutoff.toISOString(),
      dryRun: false,
    };
  }

  /**
   * Anonymise un bon : purge PII + détruit les preuves (PDF, archives, signatures).
   *
   * Volontairement CONSERVÉ (valeur statistique / registre légal) : la
   * référence du bon, ses dates (mise à disposition, restitution, création,
   * mise à jour), les équipements (BonEquipment — modèles/catalogue), et la
   * filiale. Le compte "créateur" (createdById) n'est pas touché : il
   * identifie un membre du service IT, pas le collaborateur sujet du bon.
   */
  private async anonymizeBon(bonId: string, triggeredByEmail?: string): Promise<number> {
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
        await unlink(full).catch((err) =>
          this.logger.warn(
            `Fichier signature non supprimé (${basename}) lors de l'anonymisation du bon ${bonId}: ${(err as Error).message}`,
          ),
        );
      }
    }

    // 2. Pièces jointes (fichiers + lignes)
    const attachmentsPurged = await this.attachments.purgeForBon(bonId);

    // 3. Transaction : purge PII + preuves en base, marque anonymisé
    await this.prisma.$transaction(async (tx) => {
      const currentBon = await tx.bon.findUnique({
        where: { id: bonId },
        select: { collaborateurId: true, collaborateurEmail: true },
      });
      const oldEmailLower = currentBon?.collaborateurEmail?.toLowerCase();
      const oldCollaborateurId = currentBon?.collaborateurId;

      // Compte technique "anonymisé" — upsert : créé une seule fois, réutilisé
      // ensuite pour tous les bons anonymisés (idempotent, pas de course entre
      // deux runs qui tenteraient chacun de le créer).
      const anonymUser = await tx.user.upsert({
        where: { email: ANONYMIZED_EMAIL },
        update: {},
        create: {
          email: ANONYMIZED_EMAIL,
          samAccountName: 'anonymise_rgpd',
          displayName: 'Collaborateur anonymisé',
          role: 'collaborator',
          isLocalAccount: true,
          active: false,
          passwordHash: null,
        },
      });

      // Réassigne aussi les FK userId (pas seulement les champs texte email) :
      // Contestation et AuditLog sont chargés avec `include: user` ailleurs
      // dans l'app — sans ça, le nom/email réel du collaborateur réapparaîtrait
      // via la jointure malgré l'anonymisation des colonnes texte.
      if (oldCollaborateurId) {
        await tx.contestation.updateMany({
          where: { bonId, userId: oldCollaborateurId },
          data: { userId: anonymUser.id },
        });
        await tx.auditLog.updateMany({
          where: { bonId, userId: oldCollaborateurId },
          data: { userId: anonymUser.id },
        });
      }

      await tx.signature.updateMany({
        where: { bonId },
        data: {
          signerEmail: null,
          signerIp: null,
          signerUserAgent: null,
          signatureImagePath: null,
          // Les sceaux HMAC et jetons d'horodatage n'ont plus de sens une fois
          // les champs probants qu'ils couvrent (email, IP…) effacés
          seal: null,
          sealedAt: null,
          tsToken: null,
        },
      });
      // Preuves binaires (contiennent noms/emails/signatures) — durée légale expirée
      await tx.pdfSnapshot.deleteMany({ where: { bonId } });
      await tx.proofArchive.deleteMany({ where: { bonId } });

      await tx.notificationLog.updateMany({
        where: { bonId },
        data: { recipientEmail: ANONYMIZED_EMAIL },
      });

      await tx.contestation.updateMany({ where: { bonId }, data: { message: '[anonymisé]' } });
      await tx.smbExport.updateMany({ where: { bonId }, data: { filename: 'anonymise.pdf' } });

      // Journaux d'audit liés au bon : IP/UA systématiquement purgés ; l'email
      // n'est réécrit que s'il correspond au collaborateur (jamais un agent IT
      // ayant agi sur le bon), et les clés JSON pouvant porter des PII sont
      // retirées de `details`.
      const auditLogs = await tx.auditLog.findMany({
        where: { bonId },
        select: { id: true, userEmail: true, details: true },
      });
      for (const log of auditLogs) {
        const matchesCollaborateur =
          !!log.userEmail && !!oldEmailLower && log.userEmail.toLowerCase() === oldEmailLower;
        const sanitizedDetails = sanitizeAuditDetails(log.details);
        await tx.auditLog.update({
          where: { id: log.id },
          data: {
            userEmail: matchesCollaborateur ? ANONYMIZED_EMAIL : log.userEmail,
            ipAddress: null,
            userAgent: null,
            details: sanitizedDetails === null ? Prisma.JsonNull : (sanitizedDetails as Prisma.InputJsonValue),
          },
        });
      }

      // Anonymise les champs personnels du bon (conserve réf/dates/statut/équipements/filiale)
      await tx.bon.update({
        where: { id: bonId },
        data: {
          collaborateurId: anonymUser.id,
          collaborateurEmail: ANONYMIZED_EMAIL,
          notes: null,
          pdfMiseDispoSnapshot: null,
          pdfRestitutionSnapshot: null,
          anonymizedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          bonId,
          userEmail: triggeredByEmail ?? null,
          action: 'bon_anonymized',
          details: { reason: 'retention_rgpd' },
        },
      });
    });

    return attachmentsPurged;
  }

  /**
   * Purge complémentaire (retention.attachment_months) : supprime les pièces
   * jointes des bons clôturés/annulés au-delà de N mois, indépendamment de
   * l'anonymisation complète du bon (délai plus long, cf. plancher légal).
   */
  async purgeOldAttachments(cutoff: Date): Promise<number> {
    const targets = await this.prisma.attachment.findMany({
      where: { bon: { status: { in: ['archived', 'cancelled'] }, updatedAt: { lt: cutoff } } },
      select: { id: true, storedPath: true },
    });

    let count = 0;
    for (const att of targets) {
      try {
        const basename = path.basename(att.storedPath);
        const fullPath = path.join(ATTACHMENTS_DIR, basename);
        if (fullPath.startsWith(ATTACHMENTS_DIR)) {
          try {
            await unlink(fullPath);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
              this.logger.warn(
                `Fichier pièce jointe non supprimé (${basename}) lors de la purge rétention: ${(err as Error).message}`,
              );
            }
          }
        }
        await this.prisma.attachment.delete({ where: { id: att.id } });
        count++;
      } catch (err) {
        this.logger.error(`Échec purge pièce jointe ${att.id}: ${(err as Error).message}`);
      }
    }

    if (count > 0) {
      await this.prisma.auditLog.create({
        data: { action: 'attachments_purged', details: { count } },
      });
      this.logger.log(
        `Purge pièces jointes anciennes : ${count} fichier(s) supprimé(s) (cutoff ${cutoff.toISOString().slice(0, 10)})`,
      );
    }

    return count;
  }

  /** Cron hebdomadaire (dimanche 03h, heure de Paris) — anonymisation si la rétention est activée. */
  @Cron('0 3 * * 0', { timeZone: 'Europe/Paris' })
  async cronRetention(): Promise<void> {
    try {
      const enabled = await this.config.get('retention', 'enabled');
      if (enabled !== 'true') return;
      this.logger.log('Cron rétention RGPD : démarrage');
      const result = await this.run(false, undefined, 'cron');
      this.logger.log(
        `Cron rétention RGPD terminé : ${result.anonymized}/${result.eligible} anonymisé(s), ` +
        `${result.oldAttachmentsPurged} pièce(s) jointe(s) ancienne(s) purgée(s)`,
      );
      // Nettoyage technique complémentaire : les tokens abandonnés sont déjà
      // purgés par run() ci-dessus (inclus dans l'audit retention_run) — il ne
      // reste que les vieux journaux d'audit, hors périmètre de cet audit.
      const oldAuditLogs = await this.purgeOldAuditLogs();
      this.logger.log(`Purge technique complémentaire : ${oldAuditLogs} log(s) d'audit`);
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

    const attachmentMonths = await this.getMonths('attachment_months', DEFAULT_ATTACHMENT_MONTHS);
    const attachmentCutoff = this.cutoffDate(attachmentMonths);

    const [expiredTokenCount, oldAuditCount, totalAuditCount, totalSignatureCount, oldAttachmentCount] =
      await Promise.all([
        this.prisma.signature.count({
          where: { signed: false, tokenExpiresAt: { lt: tokenCutoff } },
        }),
        this.prisma.auditLog.count({ where: { createdAt: { lt: auditCutoff } } }),
        this.prisma.auditLog.count(),
        this.prisma.signature.count(),
        this.countOldAttachments(attachmentCutoff),
      ]);

    return {
      enabled: enabled === 'true',
      config: { expiredTokensDays: days, auditLogsYears: years, attachmentMonths },
      purgeable: { expiredTokens: expiredTokenCount, oldAuditLogs: oldAuditCount, oldAttachments: oldAttachmentCount },
      totals: { auditLogs: totalAuditCount, signatures: totalSignatureCount },
    };
  }
}
