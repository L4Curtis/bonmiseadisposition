import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import type { EquipmentLine, UserResult } from './types';

export interface BonFormSnapshotInput {
  collaborateur: UserResult | null;
  filialeId: string;
  civilite: 'mme' | 'mr';
  dateMiseDisposition: string;
  dateRestitution: string;
  notes: string;
  equipments: EquipmentLine[];
  /** true dès que le formulaire doit servir de référence pour la comparaison
   *  (création : dès le montage ; édition : passe à true une fois le
   *  brouillon chargé — voir useBonCreateForm). */
  initiallyLoaded: boolean;
  submitting: boolean;
}

export interface BonFormSnapshotResult {
  /** Instantané JSON courant du formulaire — réutilisé par l'appelant pour
   *  fermer le panneau de conflits de numéro de série dès qu'un champ change. */
  snapshot: string;
  loaded: boolean;
  setLoaded: (loaded: boolean) => void;
  confirmLeave: () => boolean;
  /** Le formulaire a changé depuis la baseline — exposé pour que l'appelant
   *  ne purge le brouillon local (localStorage) qu'après un abandon EXPLICITE
   *  de modifications réelles, jamais un simple retour sans rien changer. */
  dirty: boolean;
}

/** Garde « modifications non enregistrées » : compare un instantané du
 *  formulaire à une baseline établie une fois prêt (création : au montage ;
 *  édition : après chargement du brouillon), et avertit avant de quitter
 *  (fermeture d'onglet via useUnsavedChangesWarning, ou navigation interne
 *  via confirmLeave). */
export function useBonFormSnapshot({
  collaborateur,
  filialeId,
  civilite,
  dateMiseDisposition,
  dateRestitution,
  notes,
  equipments,
  initiallyLoaded,
  submitting,
}: BonFormSnapshotInput): BonFormSnapshotResult {
  const [loaded, setLoaded] = useState(initiallyLoaded);
  const baseline = useRef<string | null>(null);
  const snapshot = useMemo(
    () => JSON.stringify({
      collaborateurId: collaborateur?.id ?? '',
      filialeId, civilite, dateMiseDisposition, dateRestitution, notes,
      equipments: equipments.map((e) => ({
        c: e.catalogItemId ?? '', l: e.customLabel ?? '', s: e.serialNumber ?? '',
        i: e.inventoryNumber ?? '', n: e.notes ?? '',
      })),
    }),
    [collaborateur, filialeId, civilite, dateMiseDisposition, dateRestitution, notes, equipments],
  );
  useEffect(() => {
    if (loaded && baseline.current === null) baseline.current = snapshot;
  }, [loaded, snapshot]);
  const dirty = baseline.current !== null && snapshot !== baseline.current;
  useUnsavedChangesWarning(dirty && !submitting);
  const confirmLeave = () =>
    !dirty || window.confirm('Des modifications non enregistrées seront perdues. Quitter quand même ?');

  return { snapshot, loaded, setLoaded, confirmLeave, dirty };
}
