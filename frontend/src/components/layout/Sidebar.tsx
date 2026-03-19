import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';

const itNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/bons', icon: FileText, label: 'Bons' },
  { to: '/admin/utilisateurs', icon: Users, label: 'Collaborateurs' },
  { to: '/admin/catalogue', icon: Package, label: 'Catalogue' },
  { to: '/admin/filiales', icon: Building2, label: 'Filiales' },
  { to: '/admin/audit', icon: ScrollText, label: 'Audit' },
  { to: '/admin/configuration', icon: Settings, label: 'Administration' },
];

const collaboratorNavItems = [
  { to: '/mes-bons', icon: FileText, label: 'Mes bons' },
];

export function Sidebar() {
  const { user } = useAuth();
  const navItems = user?.isItStaff ? itNavItems : collaboratorNavItems;

  return (
    <aside className="flex w-64 flex-col border-r bg-slate-50">
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-sm font-semibold text-slate-700">Bons de Mise à Disposition</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-3">
        <div className="rounded-md bg-slate-100 px-3 py-2">
          <p className="text-xs font-medium text-slate-700">{user?.displayName}</p>
          <p className="text-xs text-slate-500">{user?.role}</p>
        </div>
      </div>
    </aside>
  );
}
