import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { JobTrackerService, JobOutcome } from '../monitoring/job-tracker.service';
import { JOB_KEYS } from '../monitoring/job-registry';
import { anonymizeBon as anonymizeBonPure } from './anonymize-bon';
import { purgeOldAttachments as purgeOldAttachmentsPure } from './purge-old-attachments';
import { purgeExpiredTokens as purgeExpiredTokensPure, purgeOldAuditLogs as purgeOldAuditLogsPure } from './purge-technical';
import { computeRetentionStats, RetentionStats } from './retention-stats';

const DEFAULT_ANONYMIZE_MONTHS = 60; // 5 ans par défaut — plancher légal RGPD
const ANONYMIZE_MONTHS_FLOOR = 60; // Plancher légal : aucune config ne peut descendre en dessous
const DEFAULT_ATTACHMENT_MONTHS = 24; // Purge indépendante des pièces jointes (défaut raisonnable, non légalement fixé)
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
    private readonly jobTracker: JobTrackerService,
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

  private async anonymizeBon(bonId: string, triggeredByEmail?: string): Promise<number> {
    return anonymizeBonPure({ prisma: this.prisma, attachments: this.attachments, logger: this.logger }, bonId, triggeredByEmail);
  }

  /** Purge complémentaire (retention.attachment_months), voir purge-old-attachments.ts. */
  async purgeOldAttachments(cutoff: Date): Promise<number> {
    return purgeOldAttachmentsPure({ prisma: this.prisma, logger: this.logger }, cutoff);
  }

  /** Cron hebdomadaire (dimanche 03h, heure de Paris) — anonymisation si la rétention est activée. */
  @Cron('0 3 * * 0', { timeZone: 'Europe/Paris' })
  async cronRetention(): Promise<void> {
    try {
      await this.jobTracker.track<void>(JOB_KEYS.RETENTION, async (): Promise<void | JobOutcome> => {
        const enabled = await this.config.get('retention', 'enabled');
        if (enabled !== 'true') return 'skipped';
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
      });
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
    return purgeExpiredTokensPure(this.prisma, this.logger, days);
  }

  /**
   * Supprime les logs d'audit plus anciens que N années.
   * Config 'retention'.audit_logs_years (défaut 5).
   */
  async purgeOldAuditLogs(): Promise<number> {
    const yearsStr = await this.config.get('retention', 'audit_logs_years');
    const years = parseInt(yearsStr || '5', 10);
    return purgeOldAuditLogsPure(this.prisma, this.logger, years);
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
  async getRetentionStats(): Promise<RetentionStats> {
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

    return computeRetentionStats(this.prisma, (c) => this.countOldAttachments(c), {
      enabled: enabled === 'true',
      expiredTokensDays: days,
      auditLogsYears: years,
      attachmentMonths,
      tokenCutoff,
      auditCutoff,
      attachmentCutoff,
    });
  }
}
