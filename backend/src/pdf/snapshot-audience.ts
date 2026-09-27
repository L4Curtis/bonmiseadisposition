import type { PdfSnapshotType, Prisma } from '@prisma/client';

/**
 * Qui consulte les documents d'un bon. L'équipe informatique voit tout
 * l'historique. Le collaborateur (et tout compte non IT, limité à ses propres
 * bons) ne voit que les documents qu'il peut garder (R-092) : jamais une
 * version intermédiaire signée par l'IT seule (bon signé par l'IT avant
 * l'envoi, PV émis avant sa signature). La règle est appliquée par le
 * serveur, à la liste comme au téléchargement : un identifiant de document
 * deviné ne suffit pas.
 */
export type DocumentAudience = 'it' | 'collaborator';

/** Documents finaux, quel que soit le signataire rattaché. */
const COLLABORATOR_DOCUMENT_TYPES: readonly PdfSnapshotType[] = Object.freeze([
  'signature_collab_mise_disposition',
  'signature_collab_restitution',
  'avenant_equipement_retrouve',
  'remise_sans_signature',
  'cloture_sans_signature',
]);

/** Filtre Prisma des documents visibles par ce public. */
export function audienceWhere(audience: DocumentAudience): Prisma.PdfSnapshotWhereInput {
  if (audience === 'it') return {};
  return {
    OR: [
      { type: { in: [...COLLABORATOR_DOCUMENT_TYPES] } },
      // Le PV n'est un document du collaborateur qu'une fois qu'il l'a signé.
      { type: 'cloture_equipements_manquants', signature: { type: 'pv_cloture' } },
    ],
  };
}
