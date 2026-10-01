import type { PdfSnapshotType } from '@prisma/client';
import { sanitizeSmbName } from '../smb/smb-filename';

/**
 * Noms de fichier des documents PDF, lisibles par un collaborateur qui reçoit
 * la pièce jointe ou par l'équipe qui parcourt le partage réseau : le nom dit
 * quel document c'est (« Bon-de-restitution-signe »), jamais le nom technique
 * du type (`signature_collab_restitution`).
 *
 * Chaque document enregistré porte en plus sa date et son heure (à la seconde,
 * heure de Paris) : deux restitutions signées le même jour ne portent jamais le
 * même nom, ni en base ni sur le partage réseau.
 */

export const DOCUMENT_FILE_LABELS: Readonly<Record<PdfSnapshotType, string>> = Object.freeze({
  signature_it_mise_disposition: 'Bon-de-mise-a-disposition_signature-IT',
  signature_collab_mise_disposition: 'Bon-de-mise-a-disposition-signe',
  signature_it_restitution: 'Bon-de-restitution_signature-IT',
  signature_collab_restitution: 'Bon-de-restitution-signe',
  cloture_equipements_manquants: 'PV-de-non-restitution-signe',
  avenant_equipement_retrouve: 'Avenant-equipement-retrouve',
  remise_sans_signature: 'Remise-constatee-sans-signature',
  cloture_sans_signature: 'Cloture-sans-signature',
});

/** Version signée par l'IT seule d'un document qui n'a pas de type propre à
 *  cette version (le PV : même type avant et après la signature du
 *  collaborateur). Remise et restitution ont déjà leur type « signature IT ». */
const IT_VERSION_FILE_LABELS: Readonly<Partial<Record<PdfSnapshotType, string>>> = Object.freeze({
  cloture_equipements_manquants: 'PV-de-non-restitution_signature-IT',
});

/** Options du nom de fichier d'un document enregistré. */
export interface DocumentFilenameOptions {
  /** Version signée par l'IT seule (PV émis, pas encore signé par le collaborateur). */
  readonly itVersion?: boolean;
}

const PARIS_PARTS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** « 2026-09-27_15h03m27 » à l'heure de Paris. */
export function fileTimestamp(at: Date): string {
  const parts = Object.fromEntries(PARIS_PARTS.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}h${parts.minute}m${parts.second}`;
}

function documentLabel(type: string, options: DocumentFilenameOptions = {}): string {
  const itLabel = options.itVersion ? IT_VERSION_FILE_LABELS[type as PdfSnapshotType] : undefined;
  return itLabel ?? DOCUMENT_FILE_LABELS[type as PdfSnapshotType] ?? sanitizeSmbName(type);
}

/**
 * Nom du fichier d'un document enregistré : référence, collaborateur,
 * document, date et heure. Ex. `BON-2026-0074_Lea-Martin_Bon-de-restitution-signe_2026-09-27_15h03m27.pdf`.
 */
export function documentFilename(
  bon: { reference: string; collaborateur?: { displayName?: string | null } | null },
  type: string,
  at: Date,
  options: DocumentFilenameOptions = {},
): string {
  const collaborateur = sanitizeSmbName(bon.collaborateur?.displayName || 'INCONNU');
  return `${bon.reference}_${collaborateur}_${documentLabel(type, options)}_${fileTimestamp(at)}.pdf`;
}

/**
 * Nom de la pièce jointe d'un email : court, sans le nom du collaborateur (il
 * le reçoit lui-même), daté à la minute : deux restitutions signées le même
 * jour ne portent pas le même nom. Ex. `BON-2026-0074_PV-de-non-restitution-signe_2026-09-27_15h03.pdf`.
 */
export function attachmentFilename(reference: string, type: string, at: Date): string {
  return `${reference}_${documentLabel(type)}_${fileTimestamp(at).slice(0, 16)}.pdf`;
}
