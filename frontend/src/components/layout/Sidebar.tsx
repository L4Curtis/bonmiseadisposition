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

// Navigation technicien : opérations + référentiel (sans accès système admin)
const technicienNavGroups: NavGroup[] = [
  {
    title: 'Opérations',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Vue d\'ensemble' },
      { to: '/bons', icon: FileText, label: 'Bons' },
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

// Navigation admin : tout (technicien + section système)
const adminNavGroups: NavGroup[] = [
  ...technicienNavGroups,
  {
    title: 'Système',
    items: [
      { to: '/admin/email-templates', icon: Mail, label: 'Modèles d\'emails' },
      { to: '/admin/pdf-templates', icon: FileText, label: 'Modèles PDF' },
      { to: '/admin/ldap', icon: Server, label: 'Active Directory' },
      { to: '/admin/audit', icon: ScrollText, label: 'Journal d\'audit' },
      { to: '/admin/configuration', icon: Settings, label: 'Configuration' },
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

/**
 * Wrapper forwardRef around NavLink compatible with TooltipTrigger asChild (Radix Slot).
 */
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
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
        isActive
          ? 'nav-item-active text-white'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
      )}
      {...props}
    >
      {children}
    </NavLink>
  );
});
SidebarNavLink.displayName = 'SidebarNavLink';

function SidebarSection({ group, isFirst }: { group: NavGroup; isFirst: boolean }) {
  return (
    <div className={cn('space-y-0.5', !isFirst && 'mt-4 border-t border-white/5 pt-4')}>
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 select-none">
        {group.title}
      </p>
      {group.items.map(({ to, icon: Icon, label, badge }) => (
        <Tooltip key={to}>
          <TooltipTrigger asChild>
            <SidebarNavLink to={to}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500/80 px-1 text-[10px] font-semibold text-white leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </SidebarNavLink>
          </TooltipTrigger>
          <TooltipContent side="right" className="hidden">
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

  const navGroups =
    activeView === 'administrateur' ? adminNavGroups
    : activeView === 'technicien' ? technicienNavGroups
    : collaboratorNavGroups;

  const viewLabel = UI_VIEW_LABELS[activeView];

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="flex w-56 flex-col bg-[hsl(var(--sidebar-bg))]"
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg btn-gradient text-white text-xs font-bold tracking-tight shadow-sm">
            GL
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">Bons IT</p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Groupe Livio</p>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto p-2.5 pt-3">
          {navGroups.map((group, index) => (
            <SidebarSection key={group.title} group={group} isFirst={index === 0} />
          ))}
        </nav>

        {/* User block */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.20)] text-[hsl(var(--primary))] text-xs font-semibold">
              {user?.displayName?.slice(0, 2).toUpperCase() || '??'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate leading-none">{user?.displayName}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-none">{viewLabel}</p>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
