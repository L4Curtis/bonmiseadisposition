import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUiView, UI_VIEW_LABELS } from '@/contexts/UiViewContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Settings,
  Users,
  Package,
  Building2,
  ScrollText,
  MessageSquareWarning,
  Server,
  Mail,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type NavItem = {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const technicienNavGroups: NavGroup[] = [
  {
    title: 'Opérations',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Vue d\'ensemble' },
      { to: '/bons', icon: FileText, label: 'Bons' },
      { to: '/admin/reports', icon: BarChart3, label: 'Reporting' },
      { to: '/admin/contestations', icon: MessageSquareWarning, label: 'Contestations' },
    ],
  },
  {
    title: 'Référentiel',
    items: [
      { to: '/admin/utilisateurs', icon: Users, label: 'Collaborateurs' },
      { to: '/admin/filiales', icon: Building2, label: 'Filiales' },
      { to: '/admin/catalogue', icon: Package, label: 'Équipements' },
    ],
  },
];

const adminNavGroups: NavGroup[] = [
  ...technicienNavGroups,
  {
    title: 'Administration',
    items: [
      { to: '/admin/configuration', icon: Settings, label: 'Configuration' },
      { to: '/admin/templates', icon: Mail, label: 'Modèles' },
      { to: '/admin/ldap-sync', icon: Server, label: 'Active Directory' },
      { to: '/admin/audit', icon: ScrollText, label: 'Journal d\'audit' },
    ],
  },
];

const collaboratorNavGroups: NavGroup[] = [
  {
    title: 'Opérations',
    items: [
      { to: '/mes-bons', icon: FileText, label: 'Mes bons' },
    ],
  },
];

const STORAGE_KEY = 'sidebar-collapsed';

const SidebarNavLink = React.forwardRef<
  HTMLAnchorElement,
  { to: string; children: React.ReactNode; className?: string }
>(({ to, children, className: _className, ...props }, ref) => {
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <NavLink
      ref={ref}
      to={to}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-all duration-150',
        isActive
          ? 'nav-item-active text-[hsl(var(--sidebar-text-active))]'
          : 'text-[hsl(var(--sidebar-text))] hover:bg-muted hover:text-foreground',
      )}
      {...props}
    >
      {/* Barre d'indicateur active (gauche) */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-[hsl(var(--sidebar-accent))] transition-all duration-200',
          isActive ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50',
        )}
      />
      {children}
    </NavLink>
  );
});
SidebarNavLink.displayName = 'SidebarNavLink';

function SidebarSection({ group, isFirst, collapsed }: { group: NavGroup; isFirst: boolean; collapsed: boolean }) {
  return (
    <div className={cn('space-y-0.5', !isFirst && 'mt-4 border-t border-[hsl(var(--border))] pt-4')}>
      <p className={cn(
        'mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest select-none whitespace-nowrap transition-opacity duration-200',
        collapsed ? 'opacity-0' : 'opacity-100 text-muted-foreground',
      )}>
        {group.title}
      </p>
      {group.items.map(({ to, icon: Icon, label, badge }) => (
        <Tooltip key={to}>
          <TooltipTrigger asChild>
            <SidebarNavLink to={to}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </SidebarNavLink>
          </TooltipTrigger>
          <TooltipContent side="right" className={collapsed ? '' : 'hidden'}>
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function Sidebar() {
  const { user } = useAuth();
  const { activeView } = useUiView();
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage indisponible
    }
  };

  const navGroups =
    activeView === 'administrateur' ? adminNavGroups
    : activeView === 'technicien' ? technicienNavGroups
    : collaboratorNavGroups;

  const viewLabel = UI_VIEW_LABELS[activeView];

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          'relative flex shrink-0 flex-col bg-[hsl(var(--sidebar-bg))] overflow-hidden transition-[width] duration-200 ease-in-out',
          'border-r border-[hsl(var(--border))]',
          collapsed ? 'w-[3.75rem]' : 'w-60',
        )}
      >
        {/* Halo de marque discret en haut du rail (rouge Livio) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{ background: 'radial-gradient(120% 100% at 50% 0%, hsl(var(--sidebar-accent) / 0.06), transparent 70%)' }}
        />

        {/* Logo */}
        <div className="relative flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] px-3.5 whitespace-nowrap">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl btn-gradient text-white text-xs font-bold tracking-tight ring-1 ring-white/20">
            GL
          </div>
          <div className={cn(
            'flex-1 min-w-0 transition-opacity duration-200',
            collapsed ? 'opacity-0' : 'opacity-100',
          )}>
            <p className="text-sm font-semibold text-foreground leading-none tracking-tight">Bons IT</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-none">Groupe Livio</p>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Navigation principale" className="relative flex-1 overflow-y-auto overflow-x-hidden p-2.5 pt-3">
          {navGroups.map((group, index) => (
            <SidebarSection key={group.title} group={group} isFirst={index === 0} collapsed={collapsed} />
          ))}
        </nav>

        {/* User block + Toggle */}
        <div className="relative border-t border-[hsl(var(--border))] p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted transition-colors">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full btn-gradient text-white text-[10px] font-bold ring-1 ring-white/20">
                  {user?.displayName?.slice(0, 2).toUpperCase() || '??'}
                </div>
                <div className={cn(
                  'min-w-0 whitespace-nowrap transition-opacity duration-200',
                  collapsed ? 'opacity-0' : 'opacity-100',
                )}>
                  <p className="text-xs font-medium text-foreground truncate leading-none">{user?.displayName}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">{viewLabel}</p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className={collapsed ? '' : 'hidden'}>
              {user?.displayName} — {viewLabel}
            </TooltipContent>
          </Tooltip>

          {/* Toggle collapse */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150 whitespace-nowrap"
                aria-label={collapsed ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'}
              >
                {collapsed
                  ? <PanelLeftOpen className="h-4 w-4 shrink-0" />
                  : <PanelLeftClose className="h-4 w-4 shrink-0" />
                }
                <span className={cn(
                  'text-xs transition-opacity duration-200',
                  collapsed ? 'opacity-0' : 'opacity-100',
                )}>Réduire</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className={collapsed ? '' : 'hidden'}>
              Agrandir
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
