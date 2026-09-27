import type { BonEquipment, LinkSignatureType } from '@/contracts/bons';
import { DOCUMENT_LABELS, categoryLabel } from '@/domain/labels';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « Bon de restitution à signer », « PV de non-restitution à signer ». */
export function documentToSignTitle(type: LinkSignatureType): string {
  return `${capitalize(DOCUMENT_LABELS[type])} à signer`;
}

/** Catégorie lisible (« PC portable »), jamais le code interne (R-091). */
export function categoryText(category: string | null | undefined): string | null {
  return category ? categoryLabel(category) : null;
}

/** Où en est un équipement, dit au collaborateur (« Chez vous », « Rendu »…). */
export function equipmentStateForCollaborator(eq: Pick<BonEquipment, 'returnState' | 'returnedAt' | 'notReturned'>): {
  label: string;
  tone: 'held' | 'to_sign' | 'returned' | 'not_returned';
} {
  const state = eq.returnState ?? (eq.notReturned ? 'not_returned' : eq.returnedAt ? 'returned' : 'out');
  if (state === 'not_returned') return { label: 'Déclaré non restitué', tone: 'not_returned' };
  if (state === 'returned_to_sign') return { label: 'Rendu — restitution à signer', tone: 'to_sign' };
  if (state === 'returned') return { label: 'Rendu', tone: 'returned' };
  return { label: 'Chez vous', tone: 'held' };
}
