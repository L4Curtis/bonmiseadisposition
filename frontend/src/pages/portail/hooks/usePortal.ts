import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LinkSignatureType, PortalBon } from '@/contracts/bons';
import type { MyContestation } from '@/contracts/contestations';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { classifyPortal, PortalGroups } from '../lib/portal-classification';
import { latestContestationByBon } from '../lib/contestation-follow-up';

/** Document qu'on s'apprête à contester depuis le portail. */
export interface ContestTarget {
  bon: PortalBon;
  document: LinkSignatureType;
}

export interface UsePortalReturn {
  loading: boolean;
  loadError: string | null;
  bonCount: number;
  groups: PortalGroups;
  contestationOf: (bonId: string) => MyContestation | undefined;
  contestTarget: ContestTarget | null;
  setContestTarget: (target: ContestTarget | null) => void;
  reload: () => void;
  onContested: () => void;
}

/** Bons du collaborateur connecté et suivi de ses contestations. Une panne du
 *  suivi n'empêche pas d'afficher les bons : il manque juste le suivi. */
export function usePortal(): UsePortalReturn {
  const [bons, setBons] = useState<PortalBon[]>([]);
  const [contestations, setContestations] = useState<MyContestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contestTarget, setContestTarget] = useState<ContestTarget | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    // Le suivi des contestations est un plus : son échec ne vide pas le portail.
    const contestationsRequest = api
      .getList<MyContestation>('/me/contestations')
      .then((list) => list.items)
      .catch(() => [] as MyContestation[]);
    Promise.all([api.getList<PortalBon>('/me/bons'), contestationsRequest])
      .then(([myBons, mine]) => {
        setBons(myBons.items);
        setContestations(mine);
      })
      .catch((e: unknown) => {
        setBons([]);
        setLoadError(errorMessage(e, 'Impossible de charger vos équipements.'));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const groups = useMemo(() => classifyPortal(bons), [bons]);
  const byBon = useMemo(() => latestContestationByBon(contestations), [contestations]);

  const onContested = () => {
    toast({
      title: 'Contestation envoyée',
      description: "L'équipe informatique est prévenue. Vous suivez sa réponse ici.",
      variant: 'success',
    });
    reload();
  };

  return {
    loading,
    loadError,
    bonCount: bons.length,
    groups,
    contestationOf: (bonId) => byBon.get(bonId),
    contestTarget,
    setContestTarget,
    reload,
    onContested,
  };
}
