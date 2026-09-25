import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface BonCreator {
  id: string;
  displayName: string;
}

/** Comptes pouvant créer un bon (administrateurs et techniciens actifs), pour
 *  le filtre « Créé par ». `GET /users/it-staff` est ouverte au technicien,
 *  contrairement à la liste de gestion des utilisateurs (`GET /users`,
 *  réservée à l'administrateur). Un échec de chargement laisse la liste vide :
 *  le filtre garde alors « Tous » et « Moi », suffisants au quotidien. */
export function useBonCreators(): BonCreator[] {
  const [creators, setCreators] = useState<BonCreator[]>([]);

  useEffect(() => {
    let ignore = false;
    api.get<BonCreator[]>('/users/it-staff')
      .then((staff) => {
        if (ignore) return;
        const sorted = staff
          .map(({ id, displayName }) => ({ id, displayName }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
        setCreators(sorted);
      })
      .catch(() => {
        // Filtre secondaire : pas de bandeau d'erreur pour lui (voir ci-dessus).
      });
    return () => { ignore = true; };
  }, []);

  return creators;
}
