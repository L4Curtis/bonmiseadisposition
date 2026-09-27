import { useState, type RefObject } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUiView } from '@/contexts/UiViewContext';
import { useOpenContestationsCount } from '@/hooks/use-open-contestations-count';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { navGroupsFor, type NavGroup } from './nav-config';
import { NavSections } from './NavSections';
import { MobileNavDrawer } from './MobileNavDrawer';
import { BrandMark, UserBadge, useUserSummary } from './SidebarParts';
import { readSidebarCollapsed, writeSidebarCollapsed } from './sidebar-preference';

interface SidebarProps {
  /** Tiroir du téléphone ouvert (piloté par le bouton ☰ de l'en-tête). */
  readonly mobileOpen?: boolean;
  readonly onMobileOpenChange?: (open: boolean) => void;
  /** Bouton ☰ : il reprend le focus à la fermeture du tiroir. */
  readonly menuButtonRef?: RefObject<HTMLButtonElement>;
}

/** Bouton « Réduire / Agrandir » du menu latéral. */
function CollapseToggle({ collapsed, onToggle }: { readonly collapsed: boolean; readonly onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
          <span className={cn('text-xs transition-opacity duration-200', collapsed ? 'opacity-0' : 'opacity-100')}>
            Réduire
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className={collapsed ? '' : 'hidden'}>
        Agrandir
      </TooltipContent>
    </Tooltip>
  );
}

/** Menu latéral de la tablette et de l'ordinateur (coque `shell:`, voir shell-media.ts), repliable. */
function DesktopRail({ groups }: { readonly groups: readonly NavGroup[] }) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const userSummary = useUserSummary();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeSidebarCollapsed(next);
  };

  return (
    <aside
      className={cn(
        'sidebar-rail relative hidden shrink-0 flex-col overflow-hidden bg-[hsl(var(--sidebar-bg))] transition-[width] duration-200 ease-in-out shell:flex',
        'border-r border-[hsl(var(--border))]',
        collapsed ? 'w-[3.75rem]' : 'w-60',
      )}
    >
      <div className="relative flex h-14 items-center gap-3 whitespace-nowrap border-b border-[hsl(var(--border))] px-3.5">
        <BrandMark collapsed={collapsed} />
      </div>

      <nav aria-label="Navigation principale" className="relative flex-1 overflow-y-auto overflow-x-hidden p-2.5 pt-3">
        <NavSections groups={groups} variant="rail" collapsed={collapsed} />
      </nav>

      <div className="relative border-t border-[hsl(var(--border))] p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="rounded-lg transition-colors hover:bg-muted">
              <UserBadge collapsed={collapsed} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className={collapsed ? '' : 'hidden'}>
            {userSummary}
          </TooltipContent>
        </Tooltip>
        <CollapseToggle collapsed={collapsed} onToggle={toggle} />
      </div>
    </aside>
  );
}

/**
 * Menu principal. Sur tablette et ordinateur : colonne latérale repliable
 * (préférence mémorisée). Sur téléphone (portrait ou paysage) : tiroir fermé par
 * défaut, avec libellés, ouvert par le bouton ☰ de l'en-tête ; la préférence
 * « replié » ne s'y applique jamais.
 */
export function Sidebar({ mobileOpen = false, onMobileOpenChange, menuButtonRef }: SidebarProps) {
  const { activeView } = useUiView();
  const openContestationsCount = useOpenContestationsCount();
  const groups = navGroupsFor(activeView, openContestationsCount);

  return (
    <TooltipProvider delayDuration={300}>
      <DesktopRail groups={groups} />
      {onMobileOpenChange && (
        <MobileNavDrawer
          open={mobileOpen}
          onOpenChange={onMobileOpenChange}
          groups={groups}
          returnFocusRef={menuButtonRef}
        />
      )}
    </TooltipProvider>
  );
}
