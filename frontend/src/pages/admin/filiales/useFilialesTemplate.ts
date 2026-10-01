import { useDownload } from '@/hooks/useDownload';

interface UseFilialesTemplateResult {
  downloadingTemplate: boolean;
  downloadTemplate: () => Promise<void>;
}

/** Fichier exemple d'import des filiales (GET /filiales/import/template),
 *  nommé par le serveur ; le navigateur ne fait que l'enregistrer. Les
 *  exports passent par le bouton commun (`FilialesExportButtons`). */
export function useFilialesTemplate(): UseFilialesTemplateResult {
  const templateFile = useDownload();

  const downloadTemplate = async (): Promise<void> => {
    await templateFile.download({
      path: '/filiales/import/template',
      fallbackFilename: 'modele-import-filiales.csv',
      errorMessage: 'Erreur lors du téléchargement du fichier exemple',
    });
  };

  return { downloadingTemplate: templateFile.downloading, downloadTemplate };
}
