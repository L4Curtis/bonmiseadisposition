import type { RefObject } from 'react';
import { useLocation } from 'react-router';
import { Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useUiView } from '@/contexts/UiViewContext';
import { APP_NAME } from '@/hooks/usePageTitle';
import { routeTitle } from '@/lib/route-titles';
import { GlobalSearch } from './header/GlobalSearch';
import { MobileSearch } from './header/MobileSearch';
import { UserMenu } from './header/UserMenu';
import { MOBILE_NAV_DRAWER_ID } from './nav-config';

interface HeaderProps {
  /** Ouvre le tiroir du menu (téléphone). */
  readonly onOpenMenu?: () => void;
  /** Tiroir ouvert : annoncé par le bouton ☰. */
  readonly menuOpen?: boolean;
  readonly menuButtonRef?: RefObject<HTMLButtonElement>;
}

const ICON_BUTTON =
  'flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * En-tête de la coque.
 * - Téléphone : ☰ (ouvre le menu), titre de la page, loupe (IT), menu du compte.
 * - Tablette et ordinateur : recherche Ctrl+K (IT), bascule du thème, menu du compte.
 */
export function Header({ onOpenMenu, menuOpen = false, menuButtonRef }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { activeView } = useUiView();
  const { pathname } = useLocation();
  // Recherche globale réservée aux vues IT (bons, collaborateurs...) — jamais
  // affichée pour Direction (lecture seule, pas d'accès aux bons individuels)
  // ni pour Collaborateur.
  const showGlobalSearch = activeView === 'technicien' || activeView === 'administrateur';
  const pageTitle = routeTitle(pathname) ?? APP_NAME;

  return (
    <header className="app-header glass-header sticky top-0 z-30 flex shrink-0 items-center justify-between gap-1 px-2 shell:px-6">
      <div className="flex min-w-0 items-center gap-1">
        {onOpenMenu && (
          <button
            ref={menuButtonRef}
            type="button"
            onClick={onOpenMenu}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            aria-controls={MOBILE_NAV_DRAWER_ID}
            aria-haspopup="dialog"
            className={`touch-target shell:hidden ${ICON_BUTTON}`}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <p className="truncate text-base font-semibold text-foreground shell:hidden">{pageTitle}</p>
        {showGlobalSearch && <GlobalSearch />}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {showGlobalSearch && <MobileSearch />}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
          className={`hidden h-8 w-8 shell:flex ${ICON_BUTTON}`}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
