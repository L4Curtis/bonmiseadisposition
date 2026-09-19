import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Supprime les signatures dont le token est expiré depuis plus de `days`
 * jours et qui n'ont jamais été signées (tokens abandonnés).
 */
export async function purgeExpiredTokens(prisma: PrismaService, logger: Logger, days: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const result = await prisma.signature.deleteMany({
    where: { signed: false, tokenExpiresAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    logger.log(
      `Purge tokens expirés : ${result.count} signature(s) non signée(s) supprimée(s) (expirées avant ${cutoff.toISOString()})`,
    );
  }
  return result.count;
}

/** Supprime les logs d'audit plus anciens que `years` années. */
export async function purgeOldAuditLogs(prisma: PrismaService, logger: Logger, years: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);

  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    logger.log(
      `Purge audit logs : ${result.count} entrée(s) supprimée(s) (antérieures au ${cutoff.toISOString()})`,
    );
  }
  return result.count;
}
