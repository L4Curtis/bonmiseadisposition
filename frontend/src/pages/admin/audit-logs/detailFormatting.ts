import { PDF_SNAPSHOT_LABELS, PDF_STAGE_LABELS, bonStatusLabel, labelOrKey } from '@/domain/labels';

// ─── Détails lisibles ───────────────────────────────────────────────────────

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Transforme une paire clé/valeur de `details` en libellé lisible, ou null si
 *  c'est du bruit (clé technique, booléen faux). */
export function formatDetailEntry(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  switch (key) {
    case 'type': return labelOrKey(PDF_SNAPSHOT_LABELS, String(value));
    case 'sha256': return `SHA-256 ${String(value).slice(0, 10)}…`;
    case 'newStatus':
    case 'currentStatus': return `Statut : ${bonStatusLabel(String(value))}`;
    case 'isInPerson': return value ? 'Présentiel' : null;
    case 'signedByProxy': return value ? 'Mandataire' : null;
    case 'mentionLuApprouve': return value ? 'Lu & approuvé' : null;
    case 'manual': return value ? 'Manuel' : null;
    case 'remaining': return `${value} restant(s)`;
    case 'reason':
    case 'message': return `« ${truncate(String(value), 60)} »`;
    case 'stage': return labelOrKey(PDF_STAGE_LABELS, String(value));
    case 'mimeType': return String(value);
    case 'size': return `${Math.max(1, Math.round(Number(value) / 1024))} Ko`;
    // Clés techniques masquées (redondantes / bruit)
    case 'filename':
    case 'titulaireEmail':
    case 'attachmentId': return null;
    default: return `${key} : ${truncate(String(value), 40)}`;
  }
}
