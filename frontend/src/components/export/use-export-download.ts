import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { CSV_EXPORT_SUCCESS } from '@/hooks/useDownload';

export interface ExportDownloadRequest {
  /** Chemin de l'export, filtres compris (`/reporting/inventory/export?…`). */
  readonly path: string;
  /** Nom du fichier si le serveur n'en annonce pas (le serveur a le dernier mot). */
  readonly fallbackFilename: string;
  /** Message si l'export échoue sans message du serveur. */
  readonly errorMessage: string;
}

export interface ExportDownload {
  /** Télécharge et enregistre le fichier ; `false` en cas d'échec (déjà affiché). */
  readonly run: (request: ExportDownloadRequest) => Promise<boolean>;
  readonly downloading: boolean;
  /** Le dernier fichier reçu était coupé (`X-Truncated`) : bandeau à afficher. */
  readonly truncated: boolean;
  /** L'utilisateur a lu le bandeau et le ferme. */
  readonly dismissTruncated: () => void;
}

/**
 * Téléchargement d'un export CSV. Comme `useDownload`, mais un fichier coupé
 * n'est pas signalé par une notification : l'écran garde un **bandeau**
 * (`ExportTruncatedBanner`) tant que l'utilisateur ne l'a pas fermé ou n'a
 * pas relancé un export complet. Un export complet confirme par une
 * notification discrète.
 */
export function useExportDownload(): ExportDownload {
  const [downloading, setDownloading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (request: ExportDownloadRequest): Promise<boolean> => {
    setDownloading(true);
    try {
      const file = await api.getFile(request.path);
      saveBlob(file.blob, file.filename ?? request.fallbackFilename);
      if (mounted.current) setTruncated(file.truncated);
      if (!file.truncated) toast({ ...CSV_EXPORT_SUCCESS, variant: 'success' });
      return true;
    } catch (e: unknown) {
      showActionError(e, request.errorMessage);
      return false;
    } finally {
      if (mounted.current) setDownloading(false);
    }
  }, []);

  const dismissTruncated = useCallback(() => setTruncated(false), []);

  return { run, downloading, truncated, dismissTruncated };
}
