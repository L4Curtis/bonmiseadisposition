import { Prisma } from '@prisma/client';
import type { PdfSnapshotType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { DocumentSignatures } from './document-signatures';
import type { DocumentRendering } from './snapshot-rendering';
import { DocumentAudience, audienceWhere } from './snapshot-audience';

/**
 * Documents PDF enregistrés (`pdf_snapshots`) : un document par signature,
 * jamais écrasé. Un même type peut donc revenir plusieurs fois sur un bon
 * (deux restitutions, remise signée de nouveau après une modification) ; le
 * plus récent est la version en vigueur, les précédents restent consultables
 * avec leur propre date et leur propre empreinte.
 */

/**
 * Signature dont le document est la preuve : celle du collaborateur s'il a
 * signé CE document, sinon la signature IT imprimée. `null` pour un geste
 * sans signature (le document n'est la preuve d'aucune signature).
 */
export function proofSignatureId(rendering: DocumentRendering, selection: DocumentSignatures): string | null {
  if (rendering.notice) return null;
  const collab = rendering.collab === 'document' ? selection.collab : null;
  return collab?.id ?? selection.it?.id ?? null;
}

/**
 * Document déjà enregistré, identique octet pour octet, pour cette signature
 * (idempotence : double appel, régénération). Le rendu étant déterministe,
 * la même empreinte signifie le même document ; une empreinte différente
 * (PV réémis avec la même signature IT, second avenant) est un NOUVEAU
 * document, conservé à côté du premier.
 */
export function findSameDocument(
  prisma: PrismaService,
  bonId: string,
  type: PdfSnapshotType,
  signatureId: string | null,
  sha256: string,
) {
  return prisma.pdfSnapshot.findFirst({
    where: { bonId, type, signatureId, sha256 },
    select: { id: true, data: true, filename: true },
  });
}

/** Version en vigueur d'un type de document pour ce public : la plus récente. */
export function findLatestDocument(prisma: PrismaService, bonId: string, type: PdfSnapshotType, audience: DocumentAudience) {
  return prisma.pdfSnapshot.findFirst({
    where: { bonId, type, ...audienceWhere(audience) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, data: true, filename: true, createdAt: true },
  });
}

/** Un document précis du bon, par son identifiant (téléchargement depuis la
 *  liste). `null` s'il n'appartient pas à ce bon ou n'est pas visible par ce
 *  public. */
export function findDocumentById(prisma: PrismaService, bonId: string, snapshotId: string, audience: DocumentAudience) {
  return prisma.pdfSnapshot.findFirst({
    where: { id: snapshotId, bonId, ...audienceWhere(audience) },
    select: { id: true, data: true, filename: true },
  });
}

/** Violation de l'unicité (bon, type, signature, empreinte) : le même
 *  document vient d'être enregistré par un appel concurrent. */
export function isDuplicateDocument(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
