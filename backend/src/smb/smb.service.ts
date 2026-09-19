import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import { writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmbBon } from '../common/types';
import { JobTrackerService, JobOutcome } from '../monitoring/job-tracker.service';
import { JOB_KEYS } from '../monitoring/job-registry';
import { SmbExportResult, SmbStatus } from './smb.types';
import { isSafeSmbExportPath } from './smb-path-safety';
import { sanitizeSmbName } from './smb-filename';
import { computeSmbExportTarget, writeSmbExportFile } from './smb-export-writer';
import { computeSmbCounts, getFailedSmbExports, SmbFailedExport } from './smb-status';
import { findMatchingSnapshot, markSnapshotMissing, retrySmbExport } from './smb-retry';

export type { SmbExportResult, SmbStatus } from './smb.types';

const MAX_RETRIES = 3;
const FAILURE_ALERT_THRESHOLD = 3;

@Injectable()
export class SmbService {
  private readonly logger = new Logger(SmbService.name);
  private lastAlertSentAt: Date | null = null;

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly jobTracker: JobTrackerService,
  ) {}

  /**
   * Export a PDF buffer to the configured path (UNC or local).
   * Tracks each export attempt in the smb_exports table.
   *
   * On Windows, UNC paths (\\server\share) are handled natively by fs.
   * On Linux/Docker, the SMB share should be mounted as a volume.
   */
  async exportPdf(
    bon: SmbBon,
    filename: string,
    pdfBuffer: Buffer,
  ): Promise<SmbExportResult> {
    const enabled = await this.configService.get('smb', 'enabled');
    if (enabled !== 'true') return { success: true, skipped: true };

    const smbPath = await this.configService.get('smb', 'path');
    if (!smbPath) {
      this.logger.warn('SMB active mais aucun chemin configuré');
      return { success: false, error: 'Aucun chemin configuré' };
    }

    if (!isSafeSmbExportPath(smbPath)) {
      this.logger.error(`SMB: chemin rejeté (répertoire système ou invalide): ${smbPath}`);
      return { success: false, error: 'Chemin rejeté' };
    }

    // Sanitize filename to prevent path traversal
    const safeFilename = path.basename(filename);
    if (!safeFilename || safeFilename !== filename) {
      this.logger.error(`SMB: nom de fichier rejeté (path traversal détecté): ${filename}`);
      return { success: false, error: 'Nom de fichier invalide' };
    }

    // Le partage doit déjà être monté : on ne crée JAMAIS la racine (mkdir
    // recursive sur un chemin absent créerait un dossier local dans le
    // conteneur, et l'export « réussirait » sans que rien n'atteigne le
    // partage réseau réel). Seuls les sous-dossiers (filiale/année/bon) sont
    // créés à la volée, une fois la racine confirmée présente.
    const bonId = 'id' in bon ? (bon as { id: string }).id : undefined;
    if (!fs.existsSync(smbPath)) {
      const msg = `Le chemin d'export n'existe pas ou le partage n'est pas monté : ${smbPath}`;
      this.logger.error(`SMB: ${msg}`);
      // Tracé en échec (pas silencieux) : visible dans le monitoring et
      // réessayable une fois le partage monté.
      if (bonId) {
        await this.prisma.smbExport.create({
          data: { bonId, filename: safeFilename, status: 'failed', errorMessage: msg.slice(0, 500), lastAttemptAt: new Date() },
        });
      }
      return { success: false, error: msg };
    }

    // Create tracking record
    const record = bonId
      ? await this.prisma.smbExport.create({
          data: { bonId, filename: safeFilename, status: 'pending' },
        })
      : null;

    try {
      const target = computeSmbExportTarget(smbPath, bon, safeFilename, this.sanitizeName);
      await writeSmbExportFile(target, pdfBuffer);

      this.logger.log(`PDF exporté vers: ${target.filialeName}/${target.year}/${target.dirName}/${target.safeFilename}`);

      if (record) {
        await this.prisma.smbExport.update({
          where: { id: record.id },
          data: { status: 'success', lastAttemptAt: new Date() },
        });
      }

      return { success: true };
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`Échec export SMB [${bon.reference}/${safeFilename}]: ${errorMsg}`);

      if (record) {
        await this.prisma.smbExport.update({
          where: { id: record.id },
          data: { status: 'failed', errorMessage: errorMsg, lastAttemptAt: new Date() },
        });
      }

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Test connection by writing and deleting a test file.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const smbPath = await this.configService.get('smb', 'path');
      if (!smbPath) {
        return { success: false, message: 'Aucun chemin configuré' };
      }

      if (!isSafeSmbExportPath(smbPath)) {
        return { success: false, message: `Chemin rejeté (répertoire système ou invalide): ${smbPath}` };
      }

      // Ne jamais créer la racine du partage : son absence signifie que le
      // partage SMB n'est pas monté, pas qu'il faut créer un dossier local.
      if (!fs.existsSync(smbPath)) {
        return { success: false, message: `Le chemin d'export n'existe pas ou le partage n'est pas monté : ${smbPath}` };
      }

      const testFile = path.join(smbPath, `.smb-test-${Date.now()}`);
      await writeFile(testFile, 'test');
      await unlink(testFile);

      return { success: true, message: `Accès en écriture vérifié sur ${smbPath}` };
    } catch (err) {
      return { success: false, message: `Pas d'accès en écriture: ${(err as Error).message}` };
    }
  }

  // ─── Monitoring ─────────────────────────────────────────────────────────────

  async getStatus(): Promise<SmbStatus> {
    const enabled = await this.configService.get('smb', 'enabled');
    if (enabled !== 'true') return { enabled: false };

    const counts = await computeSmbCounts(this.prisma);
    return { enabled: true, ...counts };
  }

  async getFailedExports(): Promise<SmbFailedExport[]> {
    const enabled = await this.configService.get('smb', 'enabled');
    if (enabled !== 'true') return [];

    return getFailedSmbExports(this.prisma);
  }

  // ─── Retry ──────────────────────────────────────────────────────────────────

  async retryOne(exportId: string): Promise<SmbExportResult> {
    const enabled = await this.configService.get('smb', 'enabled');
    if (enabled !== 'true') return { success: false, error: 'SMB non activé' };

    const record = await this.prisma.smbExport.findUnique({
      where: { id: exportId },
      include: {
        bon: {
          include: {
            filiale: { select: { displayName: true, name: true } },
            collaborateur: { select: { displayName: true } },
            pdfSnapshots: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });

    if (!record) return { success: false, error: 'Export introuvable' };
    if (record.status === 'success') return { success: true };

    const snapshot = findMatchingSnapshot(record.bon.pdfSnapshots, record.filename);

    if (!snapshot) {
      return markSnapshotMissing(this.prisma, this.logger, record.id, record.bon.reference, record.filename);
    }

    return this.retryExport(record.id, record.bon, record.filename, Buffer.from(snapshot.data));
  }

  async retryAllFailed(): Promise<{ retried: number; succeeded: number; failed: number }> {
    const enabled = await this.configService.get('smb', 'enabled');
    if (enabled !== 'true') return { retried: 0, succeeded: 0, failed: 0 };

    const failedExports = await this.prisma.smbExport.findMany({
      where: { status: 'failed', retryCount: { lt: MAX_RETRIES } },
      include: {
        bon: {
          include: {
            filiale: { select: { displayName: true, name: true } },
            collaborateur: { select: { displayName: true } },
            pdfSnapshots: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
      take: 50,
    });

    let succeeded = 0;
    let failed = 0;

    for (const record of failedExports) {
      // Voir retryOne() : correspondance exacte uniquement, jamais de fallback
      // arbitraire sur un document de preuve.
      const snapshot = findMatchingSnapshot(record.bon.pdfSnapshots, record.filename);
      if (!snapshot) {
        await markSnapshotMissing(this.prisma, this.logger, record.id, record.bon.reference, record.filename);
        failed++;
        continue;
      }

      const result = await this.retryExport(record.id, record.bon, record.filename, Buffer.from(snapshot.data));
      if (result.success) succeeded++;
      else failed++;
    }

    return { retried: failedExports.length, succeeded, failed };
  }

  /** Cron: retry failed exports every 6 hours */
  @Cron('0 */6 * * *', { timeZone: 'Europe/Paris' })
  async cronRetryFailedExports(): Promise<void> {
    try {
      await this.jobTracker.track<void>(JOB_KEYS.SMB_RETRY, async (): Promise<void | JobOutcome> => {
        const enabled = await this.configService.get('smb', 'enabled');
        if (enabled !== 'true') return 'skipped';

        // Requalify exports stuck in 'pending' (process died between record
        // creation and status update) so they enter the retry loop
        const requalified = await this.prisma.smbExport.updateMany({
          where: {
            status: 'pending',
            createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
          },
          data: { status: 'failed', errorMessage: 'Export interrompu (statut pending expiré)' },
        });
        if (requalified.count > 0) {
          this.logger.warn(`Cron SMB: ${requalified.count} export(s) bloqué(s) en 'pending' requalifié(s) en 'failed'`);
        }

        const failedCount = await this.prisma.smbExport.count({
          where: { status: 'failed', retryCount: { lt: MAX_RETRIES } },
        });

        if (failedCount === 0) return;

        this.logger.log(`Cron SMB retry: ${failedCount} exports échoués à réessayer`);
        const result = await this.retryAllFailed();
        this.logger.log(`Cron SMB retry terminé: ${result.succeeded} réussis, ${result.failed} échoués sur ${result.retried}`);

        // Alert admin if failures persist
        if (result.failed > 0) {
          await this.alertAdminIfNeeded();
        }
      });
    } catch (err) {
      // The cron package does not catch rejected promises — never let this
      // escape as an unhandledRejection
      this.logger.error(`Cron SMB retry en échec: ${(err as Error).stack ?? err}`);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async retryExport(
    exportId: string,
    bon: SmbBon,
    filename: string,
    pdfBuffer: Buffer,
  ): Promise<SmbExportResult> {
    const smbPath = (await this.configService.get('smb', 'path')) ?? '';
    return retrySmbExport(
      { prisma: this.prisma, logger: this.logger, sanitizeName: this.sanitizeName },
      smbPath,
      exportId,
      bon,
      filename,
      pdfBuffer,
    );
  }

  private async alertAdminIfNeeded(): Promise<void> {
    // Throttle: max 1 alert per 24h
    if (this.lastAlertSentAt && Date.now() - this.lastAlertSentAt.getTime() < 24 * 60 * 60 * 1000) {
      return;
    }

    const recentFailures = await this.prisma.smbExport.count({
      where: {
        status: 'failed',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (recentFailures < FAILURE_ALERT_THRESHOLD) return;

    // Log a prominent warning — admins monitoring logs will see it
    this.logger.warn(
      `⚠ SMB ALERT: ${recentFailures} exports échoués dans les dernières 24h. ` +
      `Vérifiez la configuration SMB et l'accès au partage réseau via Administration > Configuration.`,
    );

    this.lastAlertSentAt = new Date();
  }

  sanitizeName(name: string): string {
    return sanitizeSmbName(name);
  }
}
