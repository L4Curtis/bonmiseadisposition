import { useState } from 'react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { downloadBlob } from './lib/csv';

interface UseFilialesExportResult {
  exporting: boolean;
  exportCsv: (withImages: boolean) => Promise<void>;
  downloadingTemplate: boolean;
  downloadTemplate: () => Promise<void>;
}

/** Export CSV et modèle d'import des filiales : les deux fichiers sont
 *  générés côté serveur (GET /filiales/export, GET /filiales/import/template)
 *  — le navigateur se contente de récupérer le `Blob` et de déclencher son
 *  téléchargement, aucun contenu CSV n'est construit ici. */
export function useFilialesExport(): UseFilialesExportResult {
  const [exporting, setExporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const exportCsv = async (withImages: boolean): Promise<void> => {
    setExporting(true);
    try {
      const blob = await api.getBlob(`/filiales/export${withImages ? '?images=1' : ''}`);
      const suffix = withImages ? '-avec-images' : '';
      downloadBlob(`filiales${suffix}-${new Date().toISOString().slice(0, 10)}.csv`, blob);
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'export des filiales");
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async (): Promise<void> => {
    setDownloadingTemplate(true);
    try {
      const blob = await api.getBlob('/filiales/import/template');
      downloadBlob('modele-import-filiales.csv', blob);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors du téléchargement du modèle');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  return {
    exporting, exportCsv, downloadingTemplate, downloadTemplate,
  };
}
