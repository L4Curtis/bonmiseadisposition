import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Settings, Server, Building2, Package, Users, ScrollText, AlertOctagon } from 'lucide-react';

const adminNav = [
  { to: '/admin/configuration', icon: Settings, label: 'Configuration' },
  { to: '/admin/ldap', icon: Server, label: 'Sync LDAP' },
  { to: '/admin/filiales', icon: Building2, label: 'Filiales' },
  { to: '/admin/catalogue', icon: Package, label: 'Catalogue & Packs' },
  { to: '/admin/utilisateurs', icon: Users, label: 'Utilisateurs' },
  { to: '/admin/audit', icon: ScrollText, label: "Logs d'audit" },
  { to: '/admin/contestations', icon: AlertOctagon, label: 'Contestations' },
];

export function AdminLayout() {
  return (
    <div className="flex gap-6">
      <aside className="w-52 shrink-0">
        <nav className="space-y-1">
          {adminNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
