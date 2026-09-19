import { PrismaService } from '../prisma/prisma.service';

export interface SmbCounts {
  total: number;
  success: number;
  failed: number;
  pending: number;
  lastSuccessAt: Date | null;
}

/** Compteurs d'export SMB pour le tableau de bord admin. */
export async function computeSmbCounts(prisma: PrismaService): Promise<SmbCounts> {
  const [total, success, failed, pending, lastSuccess] = await Promise.all([
    prisma.smbExport.count(),
    prisma.smbExport.count({ where: { status: 'success' } }),
    prisma.smbExport.count({ where: { status: 'failed' } }),
    prisma.smbExport.count({ where: { status: 'pending' } }),
    prisma.smbExport.findFirst({
      where: { status: 'success' },
      orderBy: { lastAttemptAt: 'desc' },
      select: { lastAttemptAt: true },
    }),
  ]);

  return { total, success, failed, pending, lastSuccessAt: lastSuccess?.lastAttemptAt ?? null };
}

export interface SmbFailedExport {
  id: string;
  bonId: string;
  filename: string;
  errorMessage: string | null;
  retryCount: number;
  lastAttemptAt: Date | null;
  createdAt: Date;
  bonReference: string;
}

/** Liste des exports SMB en échec (les 100 plus récents), pour l'écran admin. */
export async function getFailedSmbExports(prisma: PrismaService): Promise<SmbFailedExport[]> {
  const exports = await prisma.smbExport.findMany({
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
