import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveFiliales } from '@/hooks/use-active-filiales';
import type { Filiale } from '@/types';
import type { CatalogItem, Pack } from './types';

/** Charge les données de référence nécessaires au formulaire (filiales,
 *  catalogue, packs). Sans elles le formulaire est inutilisable —
 *  `initError` permet d'afficher un bandeau avec un bouton « Réessayer ». */
export function useBonCreateReferenceData() {
  const [filiales, setFiliales] = useState<Filiale[]>([]);
  const [allCatalogItems, setAllCatalogItems] = useState<CatalogItem[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [initError, setInitError] = useState(false);
  const [initReloadKey, setInitReloadKey] = useState(0);

  useEffect(() => {
    setInitError(false);
    Promise.all([
      // Mutualisé/mis en cache 60 s via useActiveFiliales — partagé avec les
      // autres formulaires/filtres qui affichent la même liste.
      getActiveFiliales(),
      api.getList<CatalogItem>('/equipment/catalog').then((list) => list.items),
      api.getList<Pack>('/equipment/packs').then((list) => list.items),
    ]).then(([f, items, p]) => {
      setFiliales(f);
      setAllCatalogItems(items);
      setPacks(p);
    }).catch(() => {
      // Sans filiales/catalogue le formulaire est inutilisable : le signaler
      setInitError(true);
    });
  }, [initReloadKey]);

  const retryInit = () => setInitReloadKey((k) => k + 1);

  return { filiales, allCatalogItems, packs, initError, retryInit };
}
