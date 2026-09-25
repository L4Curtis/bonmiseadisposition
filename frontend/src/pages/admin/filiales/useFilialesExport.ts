import { todayInParis } from '@/lib/dates';
import { useDownload } from '@/hooks/useDownload';

interface UseFilialesExportResult {
  exporting: boolean;
  exportCsv: (withImages: boolean) => Promise<void>;
  downloadingTemplate: boolean;
  downloadTemplate: () => Promise<void>;
}

/** Export CSV et fichier exemple d'import des filiales : les deux fichiers
 *  sont générés et nommés par le serveur (GET /filiales/export,
 *  GET /filiales/import/template) ; le navigateur ne fait que les enregistrer. */
export function useFilialesExport(): UseFilialesExportResult {
  const exportFile = useDownload();
  const templateFile = useDownload();

  const exportCsv = async (withImages: boolean): Promise<void> => {
    await exportFile.download({
      path: `/filiales/export${withImages ? '?images=1' : ''}`,
      fallbackFilename: `filiales${withImages ? '-avec-images' : ''}-${todayInParis()}.csv`,
      errorMessage: "Erreur lors de l'export des filiales",
    });
  };

  const downloadTemplate = async (): Promise<void> => {
    await templateFile.download({
      path: '/filiales/import/template',
      fallbackFilename: 'modele-import-filiales.csv',
      errorMessage: 'Erreur lors du téléchargement du fichier exemple',
    });
  };

  return {
    exporting: exportFile.downloading,
    exportCsv,
    downloadingTemplate: templateFile.downloading,
    downloadTemplate,
  };
}
