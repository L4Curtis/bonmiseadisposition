import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { MaterielHistoryResponse } from './types';

/**
 * Charge l'historique d'un matériel (GET /equipment/history?q=, lot L1) et
 * expose son export CSV (A4). `reference` est déjà décodée — voir
 * `decodeReferenceParam` dans types.ts pour le décodage depuis l'URL.
 */
export function useMaterielHistory(reference: string) {
  const [history, setHistory] = useState<MaterielHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    api
      .get<MaterielHistoryResponse>(`/equipment/history?q=${encodeURIComponent(reference)}`)
      .then((data) => {
        if (ignore) return;
        setHistory(data);
      })
      .catch((e: unknown) => {
        if (ignore) return;
        setError(errorMessage(e, 'Erreur de chargement'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [reference]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const blob = await api.getBlob(`/equipment/history/export?q=${encodeURIComponent(reference)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Nom de fichier sûr : la référence peut contenir des caractères
      // spéciaux (espace, `/`) qu'un système de fichiers n'accepte pas tous.
      const safeReference = reference.replace(/[^a-zA-Z0-9_-]+/g, '_');
      a.download = `historique-materiel-${safeReference}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export réussi', description: 'Le fichier CSV a été téléchargé.', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export CSV.");
    } finally {
      setExportLoading(false);
    }
  };

  return { history, error, loading, exportLoading, handleExport };
}
