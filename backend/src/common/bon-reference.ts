import { Prisma } from '@prisma/client';

/**
 * Génère la prochaine référence BON-YYYY-NNNN.
 * À appeler DANS une transaction Prisma : l'advisory lock sérialise les
 * générations concurrentes, et le MAX numérique (pas lexicographique) reste
 * correct au-delà de 9999 bons par an.
 * Partagé entre BonsService (création/duplication) et ContestationService
 * (flux corriger-et-re-signer) pour éviter une dépendance circulaire de modules.
 */
export async function generateBonReference(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const yearPrefix = `BON-${year}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bon_reference_lock'))`;
  const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(SPLIT_PART(reference, '-', 3) AS INTEGER)) AS max
    FROM bons
    WHERE reference LIKE ${`${yearPrefix}%`}
  `;
  const nextNum = (rows[0]?.max ?? 0) + 1;
  return `BON-${year}-${String(nextNum).padStart(4, '0')}`;
}
