import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmbBon } from '../common/types';

export interface SmbExportResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface SmbStatus {
  enabled: boolean;
  total?: number;
  success?: number;
  failed?: number;
  pending?: number;
  lastSuccessAt?: Date | null;
}

const MAX_RETRIES = 3;
const FAILURE_ALERT_THRESHOLD = 3;

@Injectable()
export class SmbService {
  private readonly logger = new Logger(SmbService.name);
  private lastAlertSentAt: Date | null = null;

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
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

    if (!this.isSafeExportPath(smbPath)) {
      this.logger.error(`SMB: chemin rejeté (répertoire système ou invalide): ${smbPath}`);
      return { success: false, error: 'Chemin rejeté' };
    }

    // Sanitize filename to prevent path traversal
    const safeFilename = path.basename(filename);
    if (!safeFilename || safeFilename !== filename) {
      this.logger.error(`SMB: nom de fichier rejeté (path traversal détecté): ${filename}`);
      return { success: false, error: 'Nom de fichier invalide' };
    }

    // Create tracking record
    const bonId = 'id' in bon ? (bon as { id: string }).id : undefined;
    const record = bonId
      ? await this.prisma.smbExport.create({
          data: { bonId, filename: safeFilename, status: 'pending' },
        })
      : null;

    try {
      const filialeName = this.sanitizeName(bon.filiale?.displayName || bon.filiale?.name || 'Sans-filiale');
      const year = new Date(bon.createdAt ?? new Date()).getFullYear().toString();
      const collabName = this.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
      const dirName = `${bon.reference}_${collabName}`;

      const targetDir = path.join(smbPath, filialeName, year, dirName);
      await mkdir(targetDir, { recursive: true });
      await writeFile(path.join(targetDir, safeFilename), pdfBuffer);

      this.logger.log(`PDF exporté vers: ${filialeName}/${year}/${dirName}/${safeFilename}`);

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

      if (!this.isSafeExportPath(smbPath)) {
        return { success: false, message: `Chemin rejeté (répertoire système ou invalide): ${smbPath}` };
      }

      if (!fs.existsSync(smbPath)) {
        try {
          fs.mkdirSync(smbPath, { recursive: true });
        } catch {
          return { success: false, message: `Le chemin ${smbPath} n'existe pas et ne peut pas être créé` };
        }
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

    const [total, success, failed, pending, lastSuccess] = await Promise.all([
      this.prisma.smbExport.count(),
      this.prisma.smbExport.count({ where: { status: 'success' } }),
      this.prisma.smbExport.count({ where: { status: 'failed' } }),
      this.prisma.smbExport.count({ where: { status: 'pending' } }),
      this.prisma.smbExport.findFirst({
        where: { status: 'success' },
        orderBy: { lastAttemptAt: 'desc' },
        select: { lastAttemptAt: true },
      }),
    ]);

    return {
      enabled: true,
      total,
      success,
      failed,
      pending,
      lastSuccessAt: lastSuccess?.lastAttemptAt ?? null,
    };
  }

  async getFailedExports(): Promise<Array<{
    id: string;
    bonId: string;
    filename: string;
    errorMessage: string | null;
    retryCount: number;
    lastAttemptAt: Date | null;
    createdAt: Date;
    bonReference: string;
  }>> {
    const enabled = await this.configService.get('smb', 'enabled');
    if (enabled !== 'true') return [];

    const exports = await this.prisma.smbExport.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { bon: { select: { reference: true } } },
    });

    return exports.map((e) => ({
      id: e.id,
      bonId: e.bonId,
      filename: e.filename,
      errorMessage: e.errorMessage,
      retryCount: e.retryCount,
      lastAttemptAt: e.lastAttemptAt,
      createdAt: e.createdAt,
      bonReference: e.bon.reference,
    }));
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

    const snapshot = record.bon.pdfSnapshots.find((s) => record.filename.includes(s.filename))
      ?? record.bon.pdfSnapshots[0];

    if (!snapshot) return { success: false, error: 'Aucun snapshot PDF trouvé pour ce bon' };

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
      const snapshot = record.bon.pdfSnapshots.find((s) => record.filename.includes(s.filename))
        ?? record.bon.pdfSnapshots[0];
      if (!snapshot) {
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
  @Cron('0 */6 * * *')
  async cronRetryFailedExports(): Promise<void> {
    try {
      const enabled = await this.configService.get('smb', 'enabled');
      if (enabled !== 'true') return;

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
    const smbPath = await this.configService.get('smb', 'path');
    if (!smbPath || !this.isSafeExportPath(smbPath)) {
      return { success: false, error: 'Chemin SMB invalide' };
    }

    await this.prisma.smbExport.update({
      where: { id: exportId },
      data: { retryCount: { increment: 1 } },
    });

    try {
      const filialeName = this.sanitizeName(bon.filiale?.displayName || bon.filiale?.name || 'Sans-filiale');
      const year = new Date(bon.createdAt ?? new Date()).getFullYear().toString();
      const collabName = this.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
      const dirName = `${bon.reference}_${collabName}`;
      const safeFilename = path.basename(filename);

      const targetDir = path.join(smbPath, filialeName, year, dirName);
      await mkdir(targetDir, { recursive: true });
      await writeFile(path.join(targetDir, safeFilename), pdfBuffer);

      await this.prisma.smbExport.update({
        where: { id: exportId },
        data: { status: 'success', lastAttemptAt: new Date(), errorMessage: null },
      });

      this.logger.log(`SMB retry réussi: ${bon.reference}/${safeFilename}`);
      return { success: true };
    } catch (err) {
      const errorMsg = (err as Error).message;
      await this.prisma.smbExport.update({
        where: { id: exportId },
        data: { status: 'failed', errorMessage: errorMsg, lastAttemptAt: new Date() },
      });
      this.logger.error(`SMB retry échoué [${bon.reference}/${filename}]: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
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

  /**
   * Validate that an SMB/export path is not a system-critical directory
   * (Linux containers AND Windows hosts — UNC paths pass through).
   */
  private isSafeExportPath(exportPath: string): boolean {
    if (!exportPath || typeof exportPath !== 'string') return false;
    const resolved = path.resolve(exportPath);
    const blockedUnix = ['/etc', '/proc', '/sys', '/dev', '/root', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/lib', '/lib64', '/boot'];
    const blockedWindows = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata'];
    const lower = resolved.toLowerCase();
    if (blockedUnix.some((b) => resolved === b || resolved.startsWith(b + '/'))) return false;
    if (blockedWindows.some((b) => lower === b || lower.startsWith(b + '\\'))) return false;
    return true;
  }

  /** Remove accents and special characters from a name for filesystem use */
  sanitizeName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}
