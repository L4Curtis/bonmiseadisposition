import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** Marque posée sur l'entrée d'historique ajoutée à l'ouverture d'un panneau. */
const PANEL_MARK = '__panneauOuvert';

function historyState(): Record<string, unknown> | null {
  const state: unknown = window.history.state;
  return state !== null && typeof state === 'object' ? (state as Record<string, unknown>) : null;
}

/** Vrai tant que l'entrée d'historique courante est celle d'un panneau ouvert. */
export function isPanelHistoryEntry(): boolean {
  return historyState()?.[PANEL_MARK] === true;
}

/**
 * Le geste retour du téléphone (ou le bouton Précédent) ferme le panneau
 * au lieu de quitter la page.
 *
 * À l'ouverture, on ajoute une entrée d'historique à la même adresse, marquée ;
 * le retour la retire et ferme le panneau. Fermé autrement (Échap, clic à
 * côté, croix), le panneau retire lui-même cette entrée : l'historique reste
 * celui d'avant l'ouverture. Pour naviguer depuis le panneau, passer par
 * `usePanelNavigate` : le retour ramène alors à la page d'où le panneau a
 * été ouvert.
 */
export function useCloseOnBack(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    if (!isPanelHistoryEntry()) {
      window.history.pushState({ ...historyState(), [PANEL_MARK]: true }, '');
    }
    const onPopState = () => {
      if (!isPanelHistoryEntry()) onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Fermé sans passer par le retour : on retire l'entrée ajoutée.
      if (isPanelHistoryEntry()) window.history.back();
    };
  }, [open]);
}

/**
 * Navigation depuis un panneau ouvert : la page choisie remplace l'entrée
 * d'historique du panneau, si bien que le retour ramène à la page d'où il a
 * été ouvert. Choisir la page où l'on est déjà ne navigue pas : la fermeture
 * du panneau suffit (elle retire l'entrée marquée), sans quoi l'historique
 * garderait deux fois la même page et le retour semblerait sans effet.
 * Le panneau se ferme ensuite, comme d'habitude.
 */
export function usePanelNavigate(): (to: string) => void {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return useCallback(
    (to: string) => {
      if (to === `${pathname}${search}`) return;
      navigate(to, { replace: isPanelHistoryEntry() });
    },
    [navigate, pathname, search],
  );
}
