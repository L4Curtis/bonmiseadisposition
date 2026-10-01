import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/errors';
import type { BonFiche } from '../types';

/** Clé de chargement du PV prêt (aucun identifiant de document : il n'est pas enregistré). */
export const READY_PV_LOADING_KEY = 'pv-pret';

/** Téléchargement des PDF (document courant et snapshots historiques). */
export function usePdfDownloads(id: string | undefined, bon: BonFiche | null) {
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const downloadPdf = async (type: 'mise_disposition' | 'restitution', loadingKey = 'header') => {
    setPdfLoading(loadingKey);
    try {
      const blob = await api.getBlob(`/bons/${id}/pdf?type=${type}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bon-${bon?.reference || id}${type === 'restitution' ? '-restitution' : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: 'Erreur PDF', description: errorMessage(e, 'Erreur lors de la génération du PDF'), variant: 'destructive' });
    } finally { setPdfLoading(null); }
  };

  const headerPdfType = (): 'mise_disposition' | 'restitution' => {
    if (!bon) return 'mise_disposition';
    return ['archived', 'sent_restitution', 'partially_returned'].includes(bon.status) ? 'restitution' : 'mise_disposition';
  };

  /** Télécharge UN document précis de la liste (par son identifiant), sous
   *  le nom lisible que le serveur lui a donné. */
  const downloadPdfSnapshot = async (snapshotId: string, filename: string) => {
    setPdfLoading(snapshotId);
    try {
      const blob = await api.getBlob(`/bons/${id}/pdf?snapshot=${encodeURIComponent(snapshotId)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: 'Erreur PDF', description: errorMessage(e, 'Erreur lors du téléchargement du PDF'), variant: 'destructive' });
    } finally { setPdfLoading(null); }
  };

  /** PV de non-restitution prêt (certifié par la signature IT, pas encore
   *  émis) : généré à la volée par le serveur, sous le nom qu'il lui donne. */
  const downloadReadyPv = async () => {
    setPdfLoading(READY_PV_LOADING_KEY);
    try {
      const file = await api.getFile(`/bons/${id}/pdf/pv-pret`);
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename ?? `${bon?.reference || id}_PV-de-non-restitution_signature-IT.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: 'Erreur PDF', description: errorMessage(e, 'Erreur lors du téléchargement du PV'), variant: 'destructive' });
    } finally { setPdfLoading(null); }
  };

  return { pdfLoading, downloadPdf, downloadPdfSnapshot, downloadReadyPv, headerPdfType };
}
