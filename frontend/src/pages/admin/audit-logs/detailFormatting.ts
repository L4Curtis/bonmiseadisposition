import { BON_STATUS_LABELS, type BonStatus } from '@/types';

// ─── Détails lisibles ───────────────────────────────────────────────────────

export const SNAPSHOT_TYPE_LABELS: Record<string, string> = {
  signature_it_mise_disposition: 'Cachet IT (mise à dispo)',
  signature_collab_mise_disposition: 'Mise à dispo signée',
  signature_it_restitution: 'Cachet IT (restitution)',
  signature_collab_restitution: 'Restitution signée',
  cloture_equipements_manquants: 'PV équipements manquants',
  avenant_equipement_retrouve: 'Avenant équipement retrouvé',
};

export const STAGE_LABELS: Record<string, string> = {
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV de clôture',
  general: 'Général',
};

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Transforme une paire clé/valeur de `details` en libellé lisible, ou null si
 *  c'est du bruit (clé technique, booléen faux). */
export function formatDetailEntry(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  switch (key) {
    case 'type': return SNAPSHOT_TYPE_LABELS[String(value)] ?? String(value);
    case 'sha256': return `SHA-256 ${String(value).slice(0, 10)}…`;
    case 'newStatus':
    case 'currentStatus': return `Statut : ${BON_STATUS_LABELS[value as BonStatus] ?? String(value)}`;
    case 'isInPerson': return value ? 'Présentiel' : null;
    case 'signedByProxy': return value ? 'Mandataire' : null;
    case 'mentionLuApprouve': return value ? 'Lu & approuvé' : null;
    case 'manual': return value ? 'Manuel' : null;
    case 'remaining': return `${value} restant(s)`;
    case 'reason':
    case 'message': return `« ${truncate(String(value), 60)} »`;
    case 'stage': return STAGE_LABELS[String(value)] ?? String(value);
    case 'mimeType': return String(value);
    case 'size': return `${Math.max(1, Math.round(Number(value) / 1024))} Ko`;
    // Clés techniques masquées (redondantes / bruit)
    case 'filename':
    case 'titulaireEmail':
    case 'attachmentId': return null;
    default: return `${key} : ${truncate(String(value), 40)}`;
  }
}
