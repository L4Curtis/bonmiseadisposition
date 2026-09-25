import { todayInParis } from '@/lib/dates';
import { useDownload } from '@/hooks/useDownload';

export interface UseManualUsersExportResult {
  exporting: boolean;
  exportCsv: () => Promise<void>;
  downloadingTemplate: boolean;
  downloadTemplate: () => Promise<void>;
}

/** Export CSV et fichier exemple d'import des collaborateurs créés à la main :
 *  les deux fichiers sont générés et nommés par le serveur (échappement
 *  anti-formule compris) ; le navigateur ne fait que les enregistrer. */
export function useManualUsersExport(): UseManualUsersExportResult {
  const exportFile = useDownload();
  const templateFile = useDownload();

  const exportCsv = async (): Promise<void> => {
    await exportFile.download({
      path: '/users/manual/export',
      fallbackFilename: `collaborateurs-manuels-${todayInParis()}.csv`,
      errorMessage: "Erreur lors de l'export des collaborateurs",
    });
  };

  const downloadTemplate = async (): Promise<void> => {
    await templateFile.download({
      path: '/users/manual/import/template',
      fallbackFilename: 'modele-import-collaborateurs.csv',
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
