import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface BonCreator {
  id: string;
  displayName: string;
}

/** Comptes pouvant créer un bon (administrateurs et techniciens actifs), pour
 *  le filtre « Créé par ». Un échec de chargement laisse la liste vide : le
 *  filtre garde alors « Tous » et « Moi », suffisants au quotidien. */
export function useBonCreators(): BonCreator[] {
  const [creators, setCreators] = useState<BonCreator[]>([]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      api.get<BonCreator[]>('/users?role=admin'),
      api.get<BonCreator[]>('/users?role=technician'),
    ])
      .then(([admins, technicians]) => {
        if (ignore) return;
        const merged = [...admins, ...technicians]
          .map(({ id, displayName }) => ({ id, displayName }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
        setCreators(merged);
      })
      .catch(() => {
        // Filtre secondaire : pas de bandeau d'erreur pour lui (voir ci-dessus).
      });
    return () => { ignore = true; };
  }, []);

  return creators;
}
