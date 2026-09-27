import { useCallback, type MouseEvent, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { NavSections } from './NavSections';
import { BrandMark, UserBadge } from './SidebarParts';
import { useCloseOnBack, usePanelNavigate } from './use-close-on-back';
import { MOBILE_NAV_DRAWER_ID, type NavGroup } from './nav-config';

interface MobileNavDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly groups: readonly NavGroup[];
  /** Élément qui reprend le focus à la fermeture (le bouton ☰ de l'en-tête). */
  readonly returnFocusRef?: RefObject<HTMLElement>;
}

/** Clic ordinaire (sans touche de modification) : un Ctrl+clic ouvre toujours un nouvel onglet. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Menu du téléphone (portrait ou paysage) : tiroir superposé à gauche, fermé par
 * défaut, ouvert par le bouton ☰ de l'en-tête. Fenêtre modale (Radix) : le
 * focus y reste piégé, Échap et le clic à côté le ferment, et le focus
 * revient au bouton ☰. Le geste retour le ferme aussi, sans quitter la page.
 * Choisir une entrée navigue puis ferme le tiroir.
 */
export function MobileNavDrawer({ open, onOpenChange, groups, returnFocusRef }: MobileNavDrawerProps) {
  const panelNavigate = usePanelNavigate();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useCloseOnBack(open, close);

  const onItemClick = (to: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    // La page choisie remplace l'entrée d'historique du tiroir : le retour
    // ramène ensuite à la page d'où l'on a ouvert le menu.
    panelNavigate(to);
    close();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-drawer-overlay=""
          className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 shell:hidden"
        />
        <DialogPrimitive.Content
          id={MOBILE_NAV_DRAWER_ID}
          aria-describedby={undefined}
          // Le bouton ☰ n'est pas un déclencheur Radix : on lui rend le focus nous-mêmes.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef?.current?.focus();
          }}
          // Téléphone couché (écran bas) : tiroir plus large, rubriques sur deux
          // colonnes et tout le tiroir qui défile (le bloc de la personne n'est
          // plus fixé en bas) : chaque entrée reste visible sans deviner qu'il
          // faut faire défiler.
          className="mobile-drawer fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col [@media(max-height:500px)]:w-[min(36rem,90vw)] [@media(max-height:500px)]:overflow-y-auto bg-[hsl(var(--sidebar-bg))] shadow-xl outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left shell:hidden"
        >
          <div className="flex h-14 shrink-0 items-center gap-3 [@media(max-height:500px)]:h-12 border-b border-[hsl(var(--border))] pl-4 pr-2">
            <BrandMark />
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="touch-target ml-auto flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <nav
            aria-label="Navigation principale"
            className="flex-1 overflow-y-auto p-3 [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible [@media(max-height:500px)]:columns-2 [@media(max-height:500px)]:gap-4"
          >
            <NavSections groups={groups} variant="drawer" onItemClick={onItemClick} />
          </nav>
          <div className="shrink-0 border-t border-[hsl(var(--border))] p-3 [@media(max-height:500px)]:py-1">
            <UserBadge collapsed={false} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
