import { useState } from 'react';
import { api } from '@/lib/api';
import { loadBlobIntoTab, POPUP_BLOCKED_MESSAGE } from '../lib/documentBlob';

export interface UseDocumentActionsReturn {
  previewError: string | null;
  downloadError: string | null;
  handlePreview: () => Promise<void>;
  handleDownloadSigned: (bonId: string, stage?: string) => Promise<void>;
}

/** Aperçu et téléchargement des PDF liés à une signature (document exact à
 *  signer, puis document signé). Isolé de `useSignatureToken` car ces
 *  actions ouvrent un onglet de façon SYNCHRONE dans le handler de clic
 *  (voir `loadBlobIntoTab`), une contrainte propre à l'UI plutôt qu'à l'état
 *  du token. */
export function useDocumentActions(token: string | undefined): UseDocumentActionsReturn {
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Aperçu du document PDF exact qui sera signé (chaîne de preuve).
  // Ouverture SYNCHRONE dans le handler de clic : un window.open après un
  // await serait bloqué par les bloqueurs de popups (Safari iOS notamment —
  // le cas nominal d'un collaborateur sur mobile). On n'utilise pas
  // `noopener` ici car cela empêcherait de récupérer une référence à
  // l'onglet pour y injecter l'URL du blob une fois téléchargé ; on coupe
  // manuellement `opener` juste après pour conserver l'isolation.
  const handlePreview = async () => {
    setPreviewError(null);
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    if (!win) {
      setPreviewError(POPUP_BLOCKED_MESSAGE);
      return;
    }
    const err = await loadBlobIntoTab(win, () => api.getBlob(`/signature/${token}/preview`));
    if (err) setPreviewError(err);
  };

  // Téléchargement du document signé — même stratégie que l'aperçu (onglet
  // ouvert de façon synchrone, rempli une fois le blob récupéré). `stage`
  // omis (ex : lien 'already_signed' minimal, type de signature inconnu) →
  // le backend sert le meilleur snapshot disponible (défaut mise_disposition).
  const handleDownloadSigned = async (bonId: string, stage?: string) => {
    setDownloadError(null);
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    if (!win) {
      setDownloadError(POPUP_BLOCKED_MESSAGE);
      return;
    }
    const path = stage ? `/bons/${bonId}/pdf?stage=${stage}` : `/bons/${bonId}/pdf`;
    const err = await loadBlobIntoTab(win, () => api.getBlob(path));
    if (err) setDownloadError(err);
  };

  return { previewError, downloadError, handlePreview, handleDownloadSigned };
}
