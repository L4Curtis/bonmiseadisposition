import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { todayInParis } from '@/lib/dates';
import { CSV_EXPORT_SUCCESS, useDownload } from '@/hooks/useDownload';
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
  const { download, downloading: exportLoading } = useDownload();

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

  // Le serveur nomme le fichier ; le nom de secours ne sert que s'il ne le fait pas.
  const handleExport = async (): Promise<void> => {
    await download({
      path: `/equipment/history/export?q=${encodeURIComponent(reference)}`,
      fallbackFilename: `historique-equipement-${todayInParis()}.csv`,
      errorMessage: "Erreur lors de l'export CSV.",
      success: CSV_EXPORT_SUCCESS,
    });
  };

  return { history, error, loading, exportLoading, handleExport };
}
