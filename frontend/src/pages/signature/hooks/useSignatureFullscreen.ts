import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useCloseOnBack } from '@/components/layout/use-close-on-back';

/** Plein écran du navigateur (Android) : les barres du navigateur
 *  disparaissent et la zone de signature gagne leur hauteur. Facultatif :
 *  Safari iOS ne le propose pas pour une page, et un refus n'empêche pas de
 *  signer puisque le panneau occupe déjà tout l'écran. D'où l'erreur ignorée. */
function enterBrowserFullscreen(): void {
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== 'function' || document.fullscreenElement) return;
  root.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}

function leaveBrowserFullscreen(): void {
  if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
  document.exitFullscreen().catch(() => undefined);
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab et Maj+Tab tournent dans le panneau : la page derrière, masquée, ne
 *  reçoit pas le focus (panneau modal, comme une fenêtre). */
function keepFocusInside(panel: HTMLElement, e: KeyboardEvent): void {
  const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  const outside = !panel.contains(active);
  if (e.shiftKey && (outside || active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (outside || active === last)) {
    e.preventDefault();
    first.focus();
  }
}

export interface UseSignatureFullscreenReturn {
  expanded: boolean;
  open: () => void;
  close: () => void;
}

/**
 * Zone de signature en plein écran sur téléphone. Le canevas n'est jamais
 * recréé (seule sa mise en page change) : le tracé déjà fait est conservé,
 * à l'ouverture, à la fermeture comme à la rotation de l'appareil.
 *
 * Pendant le plein écran : la page derrière ne défile plus, le focus reste
 * dans le panneau, Échap et le geste retour du téléphone le referment au lieu
 * de quitter la page (ce qui ferait perdre la signature). Si le navigateur
 * refuse son propre plein écran (Safari iOS), le panneau couvre quand même
 * tout l'écran : rien ne dépend de ce refus.
 */
export function useSignatureFullscreen(panelRef: RefObject<HTMLElement | null>): UseSignatureFullscreenReturn {
  const [expanded, setExpanded] = useState(false);
  // Demandé dans le geste de l'utilisateur : le navigateur refuse le plein
  // écran demandé plus tard, hors d'un appui.
  const open = useCallback(() => {
    setExpanded(true);
    enterBrowserFullscreen();
  }, []);
  const close = useCallback(() => {
    setExpanded(false);
    leaveBrowserFullscreen();
  }, []);

  useCloseOnBack(expanded, close);

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab' && panelRef.current) keepFocusInside(panelRef.current, e);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded, close, panelRef]);

  return { expanded, open, close };
}

/**
 * Pincer ou zoomer depuis la zone de signature ne zoome pas la page : un
 * deuxième doigt posé pendant le tracé ne doit ni agrandir l'écran ni faire
 * défiler le document. `touch-action: none` suffit sous Chrome ; Safari iOS
 * zoome malgré lui, d'où l'annulation explicite des gestes à deux doigts et de
 * ses évènements `gesture*` propriétaires.
 */
export function useBlockZoomGestures(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const zone = ref.current;
    if (!zone) return undefined;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const cancel = (e: Event) => e.preventDefault();
    zone.addEventListener('touchmove', onTouchMove, { passive: false });
    zone.addEventListener('gesturestart', cancel);
    zone.addEventListener('gesturechange', cancel);
    return () => {
      zone.removeEventListener('touchmove', onTouchMove);
      zone.removeEventListener('gesturestart', cancel);
      zone.removeEventListener('gesturechange', cancel);
    };
  }, [ref]);
}
