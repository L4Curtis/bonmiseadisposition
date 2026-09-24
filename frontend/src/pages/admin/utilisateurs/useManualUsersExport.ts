import { useState } from 'react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { downloadBlob } from '../filiales/lib/csv';

export interface UseManualUsersExportResult {
  exporting: boolean;
  exportCsv: () => Promise<void>;
  downloadingTemplate: boolean;
  downloadTemplate: () => Promise<void>;
}

/** Export CSV et modèle d'import des collaborateurs créés à la main : les
 *  deux fichiers sont générés côté serveur (échappement anti-formule compris)
 *  — le navigateur se contente de déclencher le téléchargement. */
export function useManualUsersExport(): UseManualUsersExportResult {
  const [exporting, setExporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const exportCsv = async (): Promise<void> => {
    setExporting(true);
    try {
      const blob = await api.getBlob('/users/manual/export');
      downloadBlob(`collaborateurs-manuels-${new Date().toISOString().slice(0, 10)}.csv`, blob);
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export des collaborateurs");
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async (): Promise<void> => {
    setDownloadingTemplate(true);
    try {
      const blob = await api.getBlob('/users/manual/import/template');
      downloadBlob('modele-import-collaborateurs.csv', blob);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors du téléchargement du modèle');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  return { exporting, exportCsv, downloadingTemplate, downloadTemplate };
}
