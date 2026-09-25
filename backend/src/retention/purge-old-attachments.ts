import { Logger } from '@nestjs/common';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CLOSED_BON_STATUSES } from '../bons/bon-status';
import { ATTACHMENTS_DIR } from '../common/storage-paths';

export interface PurgeOldAttachmentsDeps {
  prisma: PrismaService;
  logger: Logger;
}

/**
 * Purge complémentaire (retention.attachment_months) : supprime les pièces
 * jointes des bons clôturés/annulés au-delà de N mois, indépendamment de
 * l'anonymisation complète du bon (délai plus long, cf. plancher légal).
 */
export async function purgeOldAttachments(deps: PurgeOldAttachmentsDeps, cutoff: Date): Promise<number> {
  const { prisma, logger } = deps;
  const targets = await prisma.attachment.findMany({
    where: { bon: { status: { in: [...CLOSED_BON_STATUSES] }, updatedAt: { lt: cutoff } } },
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
            logger.warn(
              `Fichier pièce jointe non supprimé (${basename}) lors de la purge rétention: ${(err as Error).message}`,
            );
          }
        }
      }
      await prisma.attachment.delete({ where: { id: att.id } });
      count++;
    } catch (err) {
      logger.error(`Échec purge pièce jointe ${att.id}: ${(err as Error).message}`);
    }
  }

  if (count > 0) {
    await prisma.auditLog.create({
      data: { action: 'attachments_purged', details: { count } },
    });
    logger.log(
      `Purge pièces jointes anciennes : ${count} fichier(s) supprimé(s) (cutoff ${cutoff.toISOString().slice(0, 10)})`,
    );
  }

  return count;
}
