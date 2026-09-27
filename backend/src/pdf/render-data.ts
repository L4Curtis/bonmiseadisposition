import { PrismaService } from '../prisma/prisma.service';
import type { DocumentSignatures } from './document-signatures';
import { SignerNames, normalizeEmail } from './render/signer-names';

/**
 * Données lues en base au moment du rendu, et non recopiées dans l'objet du
 * bon : les noms des signataires et le cachet de la filiale.
 */

/** Noms des comptes qui ont signé les signatures retenues pour ce document. */
export async function loadSignerNames(prisma: PrismaService, selection: DocumentSignatures): Promise<SignerNames> {
  const emails = [...new Set(
    [selection.it?.signerEmail, selection.collab?.signerEmail].map(normalizeEmail).filter((e) => e !== ''),
  )];
  if (emails.length === 0) return new Map();
  const users =
    (await prisma.user.findMany({
      where: { OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })) },
      select: { email: true, displayName: true },
    })) ?? [];
  return new Map(
    users
      .filter((u) => u.email && u.displayName)
      .map((u) => [normalizeEmail(u.email), u.displayName] as const),
  );
}

/**
 * Chemin du cachet de la filiale, lu par son identifiant. Le cachet n'a donc
 * plus besoin de voyager dans l'objet du bon, ni dans aucune réponse d'API.
 */
export async function loadStampPath(prisma: PrismaService, filialeId: string | undefined): Promise<string | null> {
  if (!filialeId) return null;
  const filiale = await prisma.filiale.findUnique({ where: { id: filialeId }, select: { stampPath: true } });
  return filiale?.stampPath ?? null;
}
