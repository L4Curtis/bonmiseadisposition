import type { BonForPdf, PdfSignature } from '../pdf-types';

/**
 * Ce que couvre UN document de restitution. Un bon peut être rendu en
 * plusieurs fois : chaque restitution a son document, qui liste sous
 * « Équipements restitués » seulement ce qui a été rendu DANS cette
 * restitution, rappelle à part ce qui l'avait été avant (le cumul), et range
 * ce que le collaborateur garde sous « Restent chez le collaborateur » —
 * jamais « En attente » parmi les équipements restitués.
 *
 * Fenêtre d'une restitution : les équipements marqués rendus après la
 * restitution signée précédente, et au plus tard à la signature de celle-ci
 * (le marquage précède toujours la signature). Un document pas encore signé
 * par le collaborateur (signature IT) couvre tout ce qui a été marqué depuis
 * la restitution signée précédente.
 */

type Equipment = BonForPdf['equipments'][number];

export interface RestitutionGroups {
  /** Rendus dans cette restitution. */
  returnedNow: Equipment[];
  /** Rendus lors d'une restitution précédente (rappel du cumul). */
  returnedBefore: Equipment[];
  /** Encore chez le collaborateur, ou déclarés non restitués. */
  stillHeld: Equipment[];
}

export interface RestitutionWindow {
  /** Signature de la restitution précédente (exclue), ou `null`. */
  after: number | null;
  /** Signature de cette restitution (incluse), ou `null` si pas encore signée. */
  until: number | null;
}

function timeOf(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Fenêtre du document, d'après la signature du collaborateur qu'il porte. */
export function restitutionWindow(signatures: readonly PdfSignature[], collab: PdfSignature | null): RestitutionWindow {
  const until = timeOf(collab?.signedAt);
  const earlier = signatures
    .filter((s) => s.type === 'restitution' && s.signed && !s.invalidatedAt)
    .map((s) => timeOf(s.signedAt))
    .filter((t): t is number => t !== null && (until === null || t < until));
  return { after: earlier.length > 0 ? Math.max(...earlier) : null, until };
}

export function groupRestitutionEquipments(equipments: readonly Equipment[], window: RestitutionWindow): RestitutionGroups {
  const returned = (eq: Equipment): number | null => (eq.notReturned ? null : timeOf(eq.returnedAt));
  const inWindow = (t: number): boolean =>
    (window.after === null || t > window.after) && (window.until === null || t <= window.until);
  return {
    returnedNow: equipments.filter((eq) => {
      const t = returned(eq);
      return t !== null && inWindow(t);
    }),
    returnedBefore: equipments.filter((eq) => {
      const t = returned(eq);
      return t !== null && window.after !== null && t <= window.after;
    }),
    // Rendu APRÈS la signature de ce document : encore détenu à cette date.
    stillHeld: equipments.filter((eq) => {
      const t = returned(eq);
      return t === null || (window.until !== null && t > window.until);
    }),
  };
}
