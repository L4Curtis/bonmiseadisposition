import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Bon } from './types';

export interface BonsSelection {
  readonly selectedIds: ReadonlySet<string>;
  readonly selectedBons: Bon[];
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly toggle: (id: string) => void;
  readonly toggleAll: () => void;
  readonly clear: () => void;
}

/** Sélection multiple limitée à la page affichée : elle est vidée dès que la
 *  liste change (page, filtre, tri, rechargement), pour qu'une action groupée
 *  ne porte jamais sur des bons que l'on n'a plus sous les yeux. */
export function useBonsSelection(bons: readonly Bon[]): BonsSelection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [bons]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = bons.length > 0 && bons.every((b) => selectedIds.has(b.id));

  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(bons.map((b) => b.id)));
  }, [allSelected, bons]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const selectedBons = useMemo(() => bons.filter((b) => selectedIds.has(b.id)), [bons, selectedIds]);

  return {
    selectedIds,
    selectedBons,
    allSelected,
    someSelected: selectedIds.size > 0 && !allSelected,
    toggle,
    toggleAll,
    clear,
  };
}
