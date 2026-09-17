import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
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
      api.get<Filiale[]>('/filiales/active'),
      api.get<CatalogItem[]>('/equipment/catalog').then((d) =>
        Array.isArray(d) ? d : []
      ),
      api.get<Pack[]>('/equipment/packs'),
    ]).then(([f, items, p]) => {
      setFiliales(f);
      setAllCatalogItems(Array.isArray(items) ? items : []);
      setPacks(Array.isArray(p) ? p : []);
    }).catch(() => {
      // Sans filiales/catalogue le formulaire est inutilisable : le signaler
      setInitError(true);
    });
  }, [initReloadKey]);

  const retryInit = () => setInitReloadKey((k) => k + 1);

  return { filiales, allCatalogItems, packs, initError, retryInit };
}
