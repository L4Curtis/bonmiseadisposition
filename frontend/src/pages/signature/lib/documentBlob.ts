import { errorMessage } from '@/lib/errors';

export const POPUP_BLOCKED_MESSAGE = 'Autorisez les fenêtres pop-up pour ce site pour afficher ce document.';
/** Repli si l'évènement `load` de l'onglet ne se déclenche pas (rendu PDF
 *  natif selon le navigateur) — on ne veut pas garder l'URL objet en mémoire
 *  indéfiniment. */
export const REVOKE_FALLBACK_DELAY_MS = 60_000;

/** Charge le blob récupéré via `fetchBlob` dans l'onglet `win` (déjà ouvert
 *  de façon SYNCHRONE par l'appelant, avant tout `await`, pour ne pas être
 *  bloqué par les bloqueurs de popups). Révoque l'URL objet une fois l'onglet
 *  chargé, ou après un délai en repli si l'évènement ne se déclenche pas.
 *  Retourne un message d'erreur à afficher à l'utilisateur, ou `null` en cas
 *  de succès. */
export async function loadBlobIntoTab(win: Window, fetchBlob: () => Promise<Blob>): Promise<string | null> {
  try {
    const blob = await fetchBlob();
    const url = URL.createObjectURL(blob);
    const revoke = () => URL.revokeObjectURL(url);
    win.addEventListener('load', revoke, { once: true });
    setTimeout(revoke, REVOKE_FALLBACK_DELAY_MS);
    win.location.href = url;
    return null;
  } catch (e: unknown) {
    win.close();
    return errorMessage(e, 'Impossible de charger le document.');
  }
}
