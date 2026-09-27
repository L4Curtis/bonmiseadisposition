import { forwardRef, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isNavItemActive, type NavGroup, type NavItem } from './nav-config';

/**
 * Présentation du menu :
 * - `rail` : menu latéral de la tablette et de l'ordinateur, repliable en
 *   colonne d'icônes (l'infobulle donne alors le libellé) ;
 * - `drawer` : tiroir du téléphone, toujours avec libellés et des entrées
 *   de 44 px de haut au moins (cibles tactiles).
 */
export type NavVariant = 'rail' | 'drawer';

/** Appelé au clic d'une entrée ; le tiroir s'en sert pour naviguer puis se fermer. */
export type NavItemClickHandler = (to: string, event: MouseEvent<HTMLAnchorElement>) => void;

interface NavEntryProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  readonly item: NavItem;
  readonly variant: NavVariant;
  readonly onItemClick?: NavItemClickHandler;
}

function Badge({ count }: { readonly count: number }) {
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  );
}

// Transmet la référence et les propriétés reçues : l'infobulle du menu
// replié s'accroche directement au lien.
const NavEntry = forwardRef<HTMLAnchorElement, NavEntryProps>(function NavEntry(
  { item, variant, onItemClick, onClick, ...rest },
  ref,
) {
  const { pathname } = useLocation();
  const active = isNavItemActive(item.to, pathname);
  const Icon = item.icon;

  return (
    <NavLink
      {...rest}
      ref={ref}
      to={item.to}
      onClick={(event) => {
        onClick?.(event);
        onItemClick?.(item.to, event);
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 font-medium whitespace-nowrap transition-all duration-150',
        variant === 'drawer' ? 'min-h-11 py-2.5 text-base' : 'py-2 text-sm',
        active
          ? 'nav-item-active text-[hsl(var(--sidebar-text-active))]'
          : 'text-[hsl(var(--sidebar-text))] hover:bg-muted hover:text-foreground',
      )}
    >
      {/* Barre d'indicateur de l'entrée active (à gauche) */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[hsl(var(--sidebar-accent))] transition-all duration-200',
          active ? 'scale-y-100 opacity-100' : 'scale-y-50 opacity-0',
        )}
      />
      <Icon className={cn('shrink-0', variant === 'drawer' ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden="true" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && <Badge count={item.badge} />}
    </NavLink>
  );
});

/** Entrée du menu latéral : l'infobulle ne sert que lorsque le menu est replié. */
function RailEntry({ item, collapsed }: { readonly item: NavItem; readonly collapsed: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavEntry item={item} variant="rail" />
      </TooltipTrigger>
      <TooltipContent side="right" className={collapsed ? '' : 'hidden'}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

interface NavSectionsProps {
  readonly groups: readonly NavGroup[];
  readonly variant: NavVariant;
  /** Menu latéral replié (tablette, ordinateur) ; jamais dans le tiroir. */
  readonly collapsed?: boolean;
  readonly onItemClick?: NavItemClickHandler;
}

function SectionTitle({ children, hidden }: { readonly children: ReactNode; readonly hidden: boolean }) {
  return (
    <p
      className={cn(
        'mb-1 select-none whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-widest transition-opacity duration-200',
        hidden ? 'opacity-0' : 'text-muted-foreground opacity-100',
      )}
    >
      {children}
    </p>
  );
}

/** Groupes du menu (Suivi, Référentiels…), dans le menu latéral ou le tiroir. */
export function NavSections({ groups, variant, collapsed = false, onItemClick }: NavSectionsProps) {
  const railCollapsed = variant === 'rail' && collapsed;

  return (
    <>
      {groups.map((group, index) => (
        <div
          key={group.title || index}
          // break-inside-avoid : dans le tiroir d'un téléphone couché, les
          // rubriques passent sur deux colonnes sans être coupées.
          className={cn('space-y-0.5 break-inside-avoid', index > 0 && 'mt-4 border-t border-[hsl(var(--border))] pt-4')}
        >
          {group.title && <SectionTitle hidden={railCollapsed}>{group.title}</SectionTitle>}
          {group.items.map((item) =>
            variant === 'rail' ? (
              <RailEntry key={item.to} item={item} collapsed={railCollapsed} />
            ) : (
              <NavEntry key={item.to} item={item} variant="drawer" onItemClick={onItemClick} />
            ),
          )}
        </div>
      ))}
    </>
  );
}
