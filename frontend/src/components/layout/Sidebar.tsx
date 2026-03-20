import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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

const itNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/bons', icon: FileText, label: 'Bons' },
  { to: '/admin/utilisateurs', icon: Users, label: 'Collaborateurs' },
  { to: '/admin/catalogue', icon: Package, label: 'Catalogue' },
  { to: '/admin/filiales', icon: Building2, label: 'Filiales' },
  { to: '/admin/contestations', icon: MessageSquareWarning, label: 'Contestations' },
  { to: '/admin/audit', icon: ScrollText, label: 'Audit' },
  { to: '/admin/ldap', icon: Server, label: 'Sync LDAP' },
  { to: '/admin/templates', icon: Mail, label: 'Templates' },
  { to: '/admin/configuration', icon: Settings, label: 'Administration' },
];

const collaboratorNavItems = [
  { to: '/mes-bons', icon: FileText, label: 'Mes bons' },
];

/**
 * Wrapper forwardRef around NavLink compatible with TooltipTrigger asChild (Radix Slot).
 */
const SidebarNavLink = React.forwardRef<
  HTMLAnchorElement,
  { to: string; children: React.ReactNode; className?: string }
>(({ to, children, className: _className, ...props }, ref) => {
  const location = useLocation();
  // Check if this link's path matches the current location
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <NavLink
      ref={ref}
      to={to}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
      )}
      {...props}
    >
      {children}
    </NavLink>
  );
});
SidebarNavLink.displayName = 'SidebarNavLink';

export function Sidebar() {
  const { user } = useAuth();
  const navItems = user?.isItStaff ? itNavItems : collaboratorNavItems;

  const roleLabel =
    user?.role === 'admin' ? 'Administrateur'
    : user?.role === 'technician' ? 'Technicien'
    : 'Collaborateur';

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="flex w-56 flex-col"
        style={{ backgroundColor: 'hsl(222 47% 11%)' }}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold tracking-tight shadow-sm">
            GL
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">Bons IT</p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-none">Groupe Livio</p>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Navigation principale" className="flex-1 space-y-0.5 p-2.5 pt-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <SidebarNavLink to={to}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </SidebarNavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="hidden">
                {label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        {/* User block */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 text-xs font-semibold">
              {user?.displayName?.slice(0, 2).toUpperCase() || '??'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate leading-none">{user?.displayName}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-none">{roleLabel}</p>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
