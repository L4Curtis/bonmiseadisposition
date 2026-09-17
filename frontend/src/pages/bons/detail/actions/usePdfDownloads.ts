import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/errors';
import type { BonDetailData } from '../types';

/** Téléchargement des PDF (document courant et snapshots historiques). */
export function usePdfDownloads(id: string | undefined, bon: BonDetailData | null) {
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

  const downloadPdfSnapshot = async (stage: string, loadingKey: string) => {
    setPdfLoading(loadingKey);
    try {
      const blob = await api.getBlob(`/bons/${id}/pdf?stage=${stage}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bon?.reference || id}_${stage}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: 'Erreur PDF', description: errorMessage(e, 'Erreur lors du téléchargement du PDF'), variant: 'destructive' });
    } finally { setPdfLoading(null); }
  };

  return { pdfLoading, downloadPdf, downloadPdfSnapshot, headerPdfType };
}
