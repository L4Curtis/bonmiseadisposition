import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DownloadedFile, type RequestOptions } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

export interface DownloadRequest {
  /** Chemin de l'API, paramètres compris (`/audit/export?user=…`). */
  readonly path: string;
  /** Nom du fichier si le serveur n'en annonce pas (le serveur a le dernier mot). */
  readonly fallbackFilename: string;
  /** Message affiché si le téléchargement échoue et que le serveur n'en donne pas. */
  readonly errorMessage: string;
  /** Confirmation affichée après un téléchargement complet ; absente = discret
   *  (fichier exemple, PDF). */
  readonly success?: { readonly title: string; readonly description: string };
  readonly options?: RequestOptions;
}

/** Confirmation commune des exports CSV. */
export const CSV_EXPORT_SUCCESS = { title: 'Export réussi', description: 'Le fichier CSV a été téléchargé.' } as const;

export const TRUNCATED_TITLE = 'Export incomplet';
export const TRUNCATED_MESSAGE =
  'Le fichier a atteint le nombre maximal de lignes et a été coupé. Affinez les filtres pour obtenir le reste.';

export interface Download {
  /** Télécharge et enregistre le fichier ; renvoie `null` en cas d'échec
   *  (l'erreur est déjà affichée). */
  readonly download: (request: DownloadRequest) => Promise<DownloadedFile | null>;
  readonly downloading: boolean;
  /** Le dernier fichier reçu était coupé : l'écran peut garder un bandeau. */
  readonly truncated: boolean;
}

/**
 * Téléchargement d'un fichier produit par le serveur (export CSV, fichier
 * exemple, PDF) : le nom vient du serveur, l'état « en cours » sert à désactiver
 * le bouton, et un fichier coupé à son plafond de lignes est signalé par une
 * notification qui reste affichée jusqu'à ce que l'utilisateur la ferme.
 */
export function useDownload(): Download {
  const [downloading, setDownloading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const download = useCallback(async (request: DownloadRequest): Promise<DownloadedFile | null> => {
    setDownloading(true);
    try {
      const file = request.options
        ? await api.getFile(request.path, request.options)
        : await api.getFile(request.path);
      saveBlob(file.blob, file.filename ?? request.fallbackFilename);
      if (mounted.current) setTruncated(file.truncated);
      notifyDownloaded(file, request.success);
      return file;
    } catch (e: unknown) {
      showActionError(e, request.errorMessage);
      return null;
    } finally {
      if (mounted.current) setDownloading(false);
    }
  }, []);

  return { download, downloading, truncated };
}

function notifyDownloaded(file: DownloadedFile, success: DownloadRequest['success']): void {
  if (file.truncated) {
    toast({ title: TRUNCATED_TITLE, description: TRUNCATED_MESSAGE, duration: Infinity });
    return;
  }
  if (success) toast({ ...success, variant: 'success' });
}
