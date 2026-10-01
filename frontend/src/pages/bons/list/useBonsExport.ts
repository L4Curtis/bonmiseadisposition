import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { toExportParams, type BonsListQuery } from './bonsListQuery';
import { todayInParis } from '@/lib/dates';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export CSV de la sélection de la liste (`ids`, 100 bons au plus : jamais
 *  coupé), dans l'ordre de tri affiché. L'export de toute la liste filtrée
 *  passe par ExportButton (annonce du nombre de lignes, bandeau si coupé). */
export function useBonsExport(query: BonsListQuery) {
  const [exportLoading, setExportLoading] = useState(false);

  const exportCsv = useCallback(async (ids?: readonly string[]) => {
    setExportLoading(true);
    try {
      const blob = await api.getBlob(`/bons/export?${toExportParams(query, ids)}`);
      const day = todayInParis();
      downloadBlob(blob, ids?.length ? `bons-selection-${day}.csv` : `bons-export-${day}.csv`);
      toast({
        title: 'Export réussi',
        description: ids?.length
          ? `${ids.length} bon${ids.length > 1 ? 's' : ''} exporté${ids.length > 1 ? 's' : ''} en CSV.`
          : 'Le fichier CSV a été téléchargé.',
        variant: 'success',
      });
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export CSV.");
    } finally {
      setExportLoading(false);
    }
  }, [query]);

  return { exportLoading, exportCsv };
}
