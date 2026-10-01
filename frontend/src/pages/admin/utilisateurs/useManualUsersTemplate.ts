import { useDownload } from '@/hooks/useDownload';

export interface UseManualUsersTemplateResult {
  downloadingTemplate: boolean;
  downloadTemplate: () => Promise<void>;
}

/** Fichier exemple d'import des collaborateurs créés à la main, généré et
 *  nommé par le serveur ; le navigateur ne fait que l'enregistrer. L'export
 *  passe par le bouton commun (`ManualUsersExportButton`). */
export function useManualUsersTemplate(): UseManualUsersTemplateResult {
  const templateFile = useDownload();

  const downloadTemplate = async (): Promise<void> => {
    await templateFile.download({
      path: '/users/manual/import/template',
      fallbackFilename: 'modele-import-collaborateurs.csv',
      errorMessage: 'Erreur lors du téléchargement du fichier exemple',
    });
  };

  return { downloadingTemplate: templateFile.downloading, downloadTemplate };
}
