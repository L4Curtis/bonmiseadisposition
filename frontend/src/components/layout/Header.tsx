import { useTheme } from '@/contexts/ThemeContext';
import { useUiView } from '@/contexts/UiViewContext';
import { Sun, Moon } from 'lucide-react';
import { GlobalSearch } from './header/GlobalSearch';
import { UserMenu } from './header/UserMenu';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { activeView } = useUiView();
  // Recherche globale réservée aux vues IT (bons, collaborateurs...) — jamais
  // affichée pour Direction (lecture seule, pas d'accès aux bons individuels)
  // ni pour Collaborateur.
  const showGlobalSearch = activeView === 'technicien' || activeView === 'administrateur';

  return (
    <header className="glass-header sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between px-6">
      <div className="flex items-center">
        {showGlobalSearch && <GlobalSearch />}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
