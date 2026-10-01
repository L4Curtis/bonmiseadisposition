/**
 * Ce que couvre UN document de restitution. Un bon peut être rendu en
 * plusieurs fois : chaque restitution a son document, qui liste sous
 * « Équipements restitués » seulement ce qui a été rendu DANS cette
 * restitution, rappelle à part ce qui l'avait été avant (le cumul), et range
 * ce que le collaborateur garde sous « Restent chez le collaborateur ».
 * Même découpage partout : PDF, page de signature, emails (module pur).
 *
 * Fenêtre d'une restitution : les équipements marqués rendus après la
 * restitution signée précédente, et au plus tard à la signature de celle-ci
 * (le marquage précède toujours la signature). Une restitution pas encore
 * signée couvre tout ce qui a été marqué depuis la restitution signée
 * précédente.
 */

/** Équipement tel que ce module le lit. */
export interface RestitutionEquipment {
  readonly returnedAt?: Date | string | null;
  readonly notReturned?: boolean;
}

/** Signature telle que ce module la lit. */
export interface RestitutionSignature {
  readonly type: string;
  readonly signed: boolean;
  readonly signedAt?: Date | string | null;
  readonly invalidatedAt?: Date | string | null;
}

export interface RestitutionGroups<E> {
  /** Rendus dans cette restitution. */
  returnedNow: E[];
  /** Rendus lors d'une restitution précédente (rappel du cumul). */
  returnedBefore: E[];
  /** Encore chez le collaborateur, ou déclarés non restitués. */
  stillHeld: E[];
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

/** Fenêtre d'une restitution, d'après la date de sa signature par le
 *  collaborateur (`null` : pas encore signée). */
export function restitutionWindowUntil(
  signatures: readonly RestitutionSignature[],
  signedAt: Date | string | null | undefined,
): RestitutionWindow {
  const until = timeOf(signedAt);
  const earlier = signatures
    .filter((s) => s.type === 'restitution' && s.signed && !s.invalidatedAt)
    .map((s) => timeOf(s.signedAt))
    .filter((t): t is number => t !== null && (until === null || t < until));
  return { after: earlier.length > 0 ? Math.max(...earlier) : null, until };
}

/** Répartit les équipements du bon selon la fenêtre de la restitution. */
export function groupRestitutionEquipments<E extends RestitutionEquipment>(
  equipments: readonly E[],
  window: RestitutionWindow,
): RestitutionGroups<E> {
  const returned = (eq: E): number | null => (eq.notReturned ? null : timeOf(eq.returnedAt));
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
