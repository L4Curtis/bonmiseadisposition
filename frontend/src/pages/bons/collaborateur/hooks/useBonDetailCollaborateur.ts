import { useCallback, useEffect, useState } from 'react';
import type { PdfSnapshotInfo, PortalBon } from '@/contracts/bons';
import type { MyContestation } from '@/contracts/contestations';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { classifyPortal, DocumentToSign } from '@/pages/portail/lib/portal-classification';
import { latestContestationByBon } from '@/pages/portail/lib/contestation-follow-up';
import { loadBlobIntoTab, POPUP_BLOCKED_MESSAGE } from '@/pages/signature/lib/documentBlob';
import type { CollaboratorBon } from '../lib/collaborator-view';

export interface UseBonDetailCollaborateurReturn {
  bon: CollaboratorBon | null;
  loading: boolean;
  loadError: string | null;
  pdfSnapshots: PdfSnapshotInfo[];
  /** Document qui attend la signature du collaborateur, avec son lien. */
  toSign: DocumentToSign | null;
  /** Sa contestation la plus récente sur ce bon. */
  contestation: MyContestation | null;
  pdfLoading: string | null;
  showContestation: boolean;
  setShowContestation: (show: boolean) => void;
  /** Ouvre ce document précis (son identifiant) dans le navigateur. */
  openPdf: (snapshotId: string) => Promise<void>;
  handleContestationSuccess: () => void;
}

interface DetailData {
  bon: CollaboratorBon;
  toSign: DocumentToSign | null;
  contestation: MyContestation | null;
}

/** Le bon (GET /bons/:id : c'est lui qui refuse le bon d'un autre), sa version
 *  du portail (liens signables) et le suivi de sa contestation. */
async function loadDetail(id: string): Promise<DetailData> {
  const [bon, myBons, mine] = await Promise.all([
    api.get<CollaboratorBon>(`/bons/${id}`),
    api.getList<PortalBon>('/me/bons').then((list) => list.items).catch(() => [] as PortalBon[]),
    api.getList<MyContestation>('/me/contestations').then((list) => list.items).catch(() => [] as MyContestation[]),
  ]);
  const portalBon = myBons.find((b) => b.id === id);
  // Document en attente du bon, à signer, en cours de correction ou en attente
  // d'un nouveau lien : la fiche montre sa carte dans tous les cas.
  const groups = portalBon ? classifyPortal([portalBon]) : null;
  const toSign = groups ? (groups.toSign[0] ?? groups.inCorrection[0] ?? groups.awaitingLink[0] ?? null) : null;
  return { bon, toSign, contestation: latestContestationByBon(mine).get(id) ?? null };
}

/** Charge le bon consulté par son titulaire, ses documents et sa contestation,
 *  et porte l'ouverture des documents et la contestation. */
export function useBonDetailCollaborateur(id: string | undefined): UseBonDetailCollaborateurReturn {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfSnapshots, setPdfSnapshots] = useState<PdfSnapshotInfo[]>([]);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [showContestation, setShowContestation] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    loadDetail(id)
      .then((detail) => {
        setData(detail);
        api
          .getList<PdfSnapshotInfo>(`/bons/${id}/pdf-snapshots`)
          .then((list) => setPdfSnapshots(list.items))
          .catch(() => setPdfSnapshots([]));
      })
      .catch((e: unknown) => setLoadError(errorMessage(e, 'Erreur lors du chargement du bon')))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Le PDF s'ouvre dans le navigateur (lecteur intégré du téléphone) plutôt
  // que d'être téléchargé. L'onglet est ouvert AVANT toute attente : ouvert
  // après un `await`, Safari iOS le bloquerait (voir loadBlobIntoTab).
  const openPdf = async (snapshotId: string) => {
    const bon = data?.bon;
    if (!bon) return;
    const win = window.open('', '_blank');
    if (!win) {
      toast({ title: 'Document non ouvert', description: POPUP_BLOCKED_MESSAGE, variant: 'destructive' });
      return;
    }
    win.opener = null;
    setPdfLoading(snapshotId);
    // Le document précis, tel qu'il a été signé (plusieurs restitutions
    // peuvent coexister : jamais « le dernier du type »).
    const params = new URLSearchParams({ snapshot: snapshotId });
    const error = await loadBlobIntoTab(win, () => api.getBlob(`/bons/${bon.id}/pdf?${params}`));
    setPdfLoading(null);
    if (error) toast({ title: 'Document non ouvert', description: error, variant: 'destructive' });
  };

  const handleContestationSuccess = () => {
    toast({
      title: 'Contestation envoyée',
      description: "L'équipe informatique est prévenue. Vous suivez sa réponse sur cette page.",
      variant: 'success',
    });
    load();
  };

  return {
    bon: data?.bon ?? null,
    loading,
    loadError,
    pdfSnapshots,
    toSign: data?.toSign ?? null,
    contestation: data?.contestation ?? null,
    pdfLoading,
    showContestation,
    setShowContestation,
    openPdf,
    handleContestationSuccess,
  };
}
