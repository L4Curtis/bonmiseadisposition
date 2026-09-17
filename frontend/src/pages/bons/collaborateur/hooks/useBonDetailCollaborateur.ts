import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { BonDetailData, PdfSnapshotInfo } from '../../detail/types';

export interface UseBonDetailCollaborateurReturn {
  bon: BonDetailData | null;
  loading: boolean;
  loadError: string | null;
  pdfSnapshots: PdfSnapshotInfo[];
  pdfLoading: string | null;
  showContestation: boolean;
  setShowContestation: (show: boolean) => void;
  downloadPdf: (type: string, stage?: string) => Promise<void>;
  handleContestationSuccess: () => void;
}

/** Charge le bon (et ses snapshots PDF) consulté par un collaborateur, et
 *  porte les actions de téléchargement / contestation de la page. */
export function useBonDetailCollaborateur(id: string | undefined): UseBonDetailCollaborateurReturn {
  const [bon, setBon] = useState<BonDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfSnapshots, setPdfSnapshots] = useState<PdfSnapshotInfo[]>([]);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [showContestation, setShowContestation] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api.get<BonDetailData>(`/bons/${id}`)
      .then((b) => {
        setBon(b);
        api.get<PdfSnapshotInfo[]>(`/bons/${b.id}/pdf-snapshots`)
          .then(setPdfSnapshots)
          .catch(() => setPdfSnapshots([]));
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Erreur lors du chargement du bon'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const downloadPdf = async (type: string, stage?: string) => {
    if (!bon) return;
    const key = stage ?? type;
    setPdfLoading(key);
    try {
      const params = new URLSearchParams({ type });
      if (stage) params.set('stage', stage);
      // api.getBlob rafraîchit la session sur 401 et réessaie — un fetch brut
      // renvoyait un 401 JSON silencieux après expiration du cookie d'accès (15 min).
      const blob = await api.getBlob(`/bons/${bon.id}/pdf?${params}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bon-${bon.reference}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: 'Erreur', description: errorMessage(e, 'Impossible de télécharger le PDF'), variant: 'destructive' });
    } finally {
      setPdfLoading(null);
    }
  };

  const handleContestationSuccess = () => {
    toast({ title: 'Contestation envoyée', description: 'Le service IT va traiter votre demande.', variant: 'success' });
    load();
  };

  return { bon, loading, loadError, pdfSnapshots, pdfLoading, showContestation, setShowContestation, downloadPdf, handleContestationSuccess };
}
