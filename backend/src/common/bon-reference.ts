import { Prisma } from '@prisma/client';
import { ServiceUnavailableException } from '@nestjs/common';

/** Timeout de transaction interactive recommandé pour tout appelant de
 *  generateBonReference : le verrou advisory peut faire attendre des
 *  générations concurrentes plus longtemps que le timeout par défaut de
 *  Prisma (5s). À passer explicitement en options de `prisma.$transaction`
 *  au niveau de l'appelant, ex. :
 *    prisma.$transaction(async (tx) => { ... }, BON_REFERENCE_TX_OPTIONS)
 */
export const BON_REFERENCE_TX_OPTIONS = { timeout: 10000, maxWait: 5000 } as const;

/** Code Prisma renvoyé quand une transaction interactive dépasse son timeout. */
const PRISMA_TRANSACTION_TIMEOUT_CODE = 'P2028';

/**
 * Génère la prochaine référence BON-YYYY-NNNN.
 * À appeler DANS une transaction Prisma ouverte avec BON_REFERENCE_TX_OPTIONS
 * (timeout explicite) : l'advisory lock sérialise les générations
 * concurrentes, et le MAX numérique (pas lexicographique) reste correct
 * au-delà de 9999 bons par an.
 * Partagé entre BonsService (création/duplication) et ContestationService
 * (flux corriger-et-re-signer) pour éviter une dépendance circulaire de modules.
 */
export async function generateBonReference(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const yearPrefix = `BON-${year}-`;
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bon_reference_lock'))`;
    // Seules les références entièrement numériques comptent : une référence
    // d'un autre format (données de démonstration « BON-2026-D0040 », reprise
    // d'un ancien système) faisait échouer le CAST en INTEGER pour TOUTE la
    // requête (erreur 22P02) — et plus aucun bon ne pouvait être créé. Le
    // filtre du WHERE s'applique avant l'agrégat : le CAST ne voit jamais que
    // des chiffres.
    const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(CAST(SPLIT_PART(reference, '-', 3) AS INTEGER)) AS max
      FROM bons
      WHERE reference LIKE ${`${yearPrefix}%`}
        AND SPLIT_PART(reference, '-', 3) ~ '^[0-9]+$'
    `;
    const nextNum = (rows[0]?.max ?? 0) + 1;
    return `BON-${year}-${String(nextNum).padStart(4, '0')}`;
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_TRANSACTION_TIMEOUT_CODE
    ) {
      throw new ServiceUnavailableException(
        'Génération de référence temporairement indisponible, réessayez',
      );
    }
    throw error;
  }
}
