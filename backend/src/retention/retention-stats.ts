import { PrismaService } from '../prisma/prisma.service';

export interface RetentionStatsParams {
  enabled: boolean;
  expiredTokensDays: number;
  auditLogsYears: number;
  attachmentMonths: number;
  tokenCutoff: Date;
  auditCutoff: Date;
  attachmentCutoff: Date;
}

export interface RetentionStats {
  enabled: boolean;
  config: { expiredTokensDays: number; auditLogsYears: number; attachmentMonths: number };
  purgeable: { expiredTokens: number; oldAuditLogs: number; oldAttachments: number };
  totals: { auditLogs: number; signatures: number };
}

/** Statistiques de rétention technique pour le dashboard admin. */
export async function computeRetentionStats(
  prisma: PrismaService,
  countOldAttachments: (cutoff: Date) => Promise<number>,
  params: RetentionStatsParams,
): Promise<RetentionStats> {
  const [expiredTokenCount, oldAuditCount, totalAuditCount, totalSignatureCount, oldAttachmentCount] =
    await Promise.all([
      prisma.signature.count({
        where: { signed: false, tokenExpiresAt: { lt: params.tokenCutoff } },
      }),
      prisma.auditLog.count({ where: { createdAt: { lt: params.auditCutoff } } }),
      prisma.auditLog.count(),
      prisma.signature.count(),
      countOldAttachments(params.attachmentCutoff),
    ]);

  return {
    enabled: params.enabled,
    config: {
      expiredTokensDays: params.expiredTokensDays,
      auditLogsYears: params.auditLogsYears,
      attachmentMonths: params.attachmentMonths,
    },
    purgeable: { expiredTokens: expiredTokenCount, oldAuditLogs: oldAuditCount, oldAttachments: oldAttachmentCount },
    totals: { auditLogs: totalAuditCount, signatures: totalSignatureCount },
  };
}
