import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { BonCollab } from '../types';

export interface UseMesBonsReturn {
  bons: BonCollab[];
  loading: boolean;
  loadError: string | null;
  contestingBon: BonCollab | null;
  reload: () => void;
  setContestingBon: (bon: BonCollab | null) => void;
  handleContestationSuccess: () => void;
}

/** Charge la liste des bons du collaborateur connecté (GET /bons/mes-bons)
 *  et porte l'état de la modale de contestation. */
export function useMesBons(): UseMesBonsReturn {
  const [bons, setBons] = useState<BonCollab[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contestingBon, setContestingBon] = useState<BonCollab | null>(null);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    api.get<BonCollab[]>('/bons/mes-bons')
      .then(setBons)
      .catch((e: unknown) => { setBons([]); setLoadError(e instanceof Error ? e.message : 'Erreur lors du chargement'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const handleContestationSuccess = () => {
    toast({ title: 'Contestation envoyée', description: 'Le service IT va traiter votre demande.', variant: 'success' });
    reload();
  };

  return { bons, loading, loadError, contestingBon, reload, setContestingBon, handleContestationSuccess };
}
