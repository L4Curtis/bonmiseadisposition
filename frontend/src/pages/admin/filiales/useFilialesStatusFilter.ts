import { useMemo, useState } from 'react';
import type { Filiale } from '@/types';

interface UseFilialesStatusFilterResult {
  showInactive: boolean;
  setShowInactive: (value: boolean) => void;
  visibleFiliales: Filiale[];
  inactiveCount: number;
}

/** Filtre d'affichage des filiales par état : masque les filiales
 *  désactivées par défaut (bruit pour l'usage quotidien), avec un contrôle
 *  explicite pour les réafficher ponctuellement. */
export function useFilialesStatusFilter(filiales: Filiale[]): UseFilialesStatusFilterResult {
  const [showInactive, setShowInactive] = useState(false);

  const inactiveCount = useMemo(() => filiales.filter((f) => !f.active).length, [filiales]);
  const visibleFiliales = useMemo(
    () => (showInactive ? filiales : filiales.filter((f) => f.active)),
    [filiales, showInactive],
  );

  return {
    showInactive, setShowInactive, visibleFiliales, inactiveCount,
  };
}
