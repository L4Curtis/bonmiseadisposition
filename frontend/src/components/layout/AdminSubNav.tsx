import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useEffect, useState, type ElementType } from 'react';
import {
  Settings, Server, Shield, Mail, Bell, Key, HardDrive, Activity,
  FileText, Clock, ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { CONFIG_HEALTH_STATE_LABELS, type ConfigHealthState } from '@/pages/admin/configuration/ConfigHealthCard';

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
    { to: '/admin/configuration/timestamp', label: 'Horodatage', icon: Clock },
    { to: '/admin/configuration/retention', label: 'Rétention RGPD', icon: ShieldCheck },
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

const STATE_DOT_CLASSNAME: Record<ConfigHealthState, string> = {
  configure: 'bg-success',
  incomplet: 'bg-warning',
  desactive: 'bg-muted-foreground',
  non_configure: 'bg-destructive',
};

/** Dernier segment de l'URL, utilisé comme clé de rubrique de configuration
 *  (ex. '/admin/configuration/smtp' → 'smtp'). "monitoring" n'est pas une
 *  rubrique de configuration à part entière (pas de clés propres) : elle
 *  surveille les exports déjà couverts par la rubrique "smb", dont l'état
 *  est repris telle quelle. */
function healthKeyForItem(to: string): string {
  const segment = to.split('/').pop() ?? '';
  return segment === 'monitoring' ? 'smb' : segment;
}

/** Pastille d'état de configuration (couleur = jeton du thème, jamais de
 *  couleur de palette) — chargée une fois pour la sous-navigation
 *  Configuration, afin de repérer d'un coup d'œil ce qui reste à faire. */
function useConfigHealthByKey(enabled: boolean): Record<string, ConfigHealthState> {
  const [byKey, setByKey] = useState<Record<string, ConfigHealthState>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get<{ sections: { key: string; state: ConfigHealthState }[] }>('/admin/config/health')
      .then((data) => {
        if (cancelled) return;
        const next: Record<string, ConfigHealthState> = {};
        for (const s of data.sections) next[s.key] = s.state;
        setByKey(next);
      })
      .catch(() => {
        // Pastille purement indicative : une erreur silencieuse (droits,
        // réseau) ne doit pas empêcher l'affichage du menu lui-même.
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return byKey;
}

export function AdminSubNav({ section }: { section: SubNavSection }) {
  const location = useLocation();
  const isConfigSection = section.basePath === '/admin/configuration';
  const healthByKey = useConfigHealthByKey(isConfigSection);

  return (
    <nav
      aria-label={`Sous-navigation ${section.title}`}
      // sticky sous le header vitré (h-14) : la sous-nav reste visible pendant
      // que le contenu défile
      className="w-48 shrink-0 self-start sticky top-14 max-h-[calc(100vh-3.5rem)] border-r border-border/70 bg-muted/30 overflow-y-auto"
    >
      <div className="p-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground select-none">
          {section.title}
        </p>
        <div className="space-y-0.5">
          {section.items.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            const healthState = isConfigSection ? healthByKey[healthKeyForItem(to)] : undefined;
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
                <span className="flex-1 truncate">{label}</span>
                {healthState && (
                  <>
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATE_DOT_CLASSNAME[healthState])}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{CONFIG_HEALTH_STATE_LABELS[healthState]}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
