import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { ElementType } from 'react';
import {
  Settings, Server, Shield, Mail, Bell, Key, HardDrive, Activity,
  FileText,
} from 'lucide-react';

type SubNavItem = {
  to: string;
  label: string;
  icon: ElementType;
};

type SubNavSection = {
  title: string;
  basePath: string;
  items: SubNavItem[];
};

const configSubNav: SubNavSection = {
  title: 'Configuration',
  basePath: '/admin/configuration',
  items: [
    { to: '/admin/configuration/general', label: 'Général', icon: Settings },
    { to: '/admin/configuration/ldap', label: 'Active Directory', icon: Server },
    { to: '/admin/configuration/entra', label: 'Entra ID (SSO)', icon: Shield },
    { to: '/admin/configuration/smtp', label: 'Email / SMTP', icon: Mail },
    { to: '/admin/configuration/rappels', label: 'Rappels', icon: Bell },
    { to: '/admin/configuration/tokens', label: 'Tokens', icon: Key },
    { to: '/admin/configuration/smb', label: 'Export SMB', icon: HardDrive },
    { to: '/admin/configuration/monitoring', label: 'Monitoring SMB', icon: Activity },
  ],
};

const templatesSubNav: SubNavSection = {
  title: 'Modèles',
  basePath: '/admin/templates',
  items: [
    { to: '/admin/templates/email', label: 'Modèles d\'emails', icon: Mail },
    { to: '/admin/templates/pdf', label: 'Modèles PDF', icon: FileText },
  ],
};

const subNavSections: SubNavSection[] = [configSubNav, templatesSubNav];

export function getSubNavForPath(pathname: string): SubNavSection | null {
  return subNavSections.find((s) => pathname.startsWith(s.basePath)) ?? null;
}

export function AdminSubNav({ section }: { section: SubNavSection }) {
  const location = useLocation();

  return (
    <nav
      aria-label={`Sous-navigation ${section.title}`}
      className="w-48 shrink-0 border-r border-border bg-muted/30 overflow-y-auto"
    >
      <div className="p-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground select-none">
          {section.title}
        </p>
        <div className="space-y-0.5">
          {section.items.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
