import type { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail, signerName, type SignerNames } from '../pdf/render/signer-names';

/**
 * Noms des signataires sur la fiche IT : une signature n'enregistre que
 * l'adresse du compte connecté (technicien pour une signature IT, témoin
 * d'une signature au guichet). La fiche écrit « par Thomas Girard », comme le
 * PDF, plutôt qu'une adresse (R-032).
 */

export interface WithSignerEmail {
  readonly signerEmail: string | null;
}

/** Comptes des adresses qui ont signé ce bon, lus en une requête. */
export async function loadSignatureSignerNames(
  prisma: PrismaService,
  signatures: readonly WithSignerEmail[],
): Promise<SignerNames> {
  const emails = [...new Set(signatures.map((s) => normalizeEmail(s.signerEmail)).filter((e) => e !== ''))];
  if (emails.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })) },
    select: { email: true, displayName: true },
  });
  return new Map(
    (users ?? [])
      .filter((u) => u.email && u.displayName)
      .map((u) => [normalizeEmail(u.email), u.displayName] as const),
  );
}

/** Fiche dont chaque signature porte le nom de son compte signataire
 *  (`signerName`, `null` si l'adresse ne correspond à aucun compte). */
export function withSignerNames<S extends WithSignerEmail, V extends { readonly signatures: readonly S[] }>(
  view: V,
  names: SignerNames,
): Omit<V, 'signatures'> & { signatures: Array<S & { signerName: string | null }> } {
  return {
    ...view,
    signatures: view.signatures.map((s) => ({ ...s, signerName: signerName(names, s.signerEmail) })),
  };
}
