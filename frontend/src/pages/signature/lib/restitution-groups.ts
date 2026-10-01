/**
 * Ce que couvre la restitution à signer, découpée comme dans le PDF et les
 * emails (backend : common/restitution-groups.ts) : ce qui est rendu CETTE
 * fois, ce qui l'avait été lors d'une restitution précédente (déjà signée),
 * et ce qui reste chez le collaborateur. Module pur.
 */

interface GroupableEquipment {
  readonly returnedAt: string | null;
  readonly notReturned: boolean;
}

interface GroupableSignature {
  readonly type: string;
  readonly signed: boolean;
  readonly signedAt: string | null;
  readonly invalidatedAt?: string | null;
}

export interface RestitutionGroups<E> {
  /** Rendus dans la restitution à signer. */
  returnedNow: E[];
  /** Rendus lors d'une restitution précédente, déjà signée. */
  returnedBefore: E[];
  /** Encore chez le collaborateur (hors déclarés non restitués). */
  stillHeld: E[];
}

const timeOf = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/** Date de la dernière restitution signée (et toujours valable), ou `null`. */
function lastSignedRestitution(signatures: readonly GroupableSignature[]): number | null {
  const times = signatures
    .filter((s) => s.type === 'restitution' && s.signed && !s.invalidatedAt)
    .map((s) => timeOf(s.signedAt))
    .filter((t): t is number => t !== null);
  return times.length > 0 ? Math.max(...times) : null;
}

/** Répartit les équipements d'une restitution pas encore signée. */
export function pendingRestitutionGroups<E extends GroupableEquipment>(
  equipments: readonly E[],
  signatures: readonly GroupableSignature[],
): RestitutionGroups<E> {
  const after = lastSignedRestitution(signatures);
  const returnedTime = (eq: E) => (eq.notReturned ? null : timeOf(eq.returnedAt));
  return {
    returnedNow: equipments.filter((eq) => {
      const t = returnedTime(eq);
      return t !== null && (after === null || t > after);
    }),
    returnedBefore: equipments.filter((eq) => {
      const t = returnedTime(eq);
      return t !== null && after !== null && t <= after;
    }),
    stillHeld: equipments.filter((eq) => !eq.notReturned && !eq.returnedAt),
  };
}
