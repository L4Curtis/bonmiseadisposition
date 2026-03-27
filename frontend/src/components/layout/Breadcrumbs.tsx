import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const LABELS: Record<string, string> = {
  admin: 'Administration',
  configuration: 'Configuration',
  templates: 'Modèles',
  general: 'Général',
  ldap: 'Active Directory',
  entra: 'Entra ID (SSO)',
  smtp: 'Email / SMTP',
  rappels: 'Rappels',
  tokens: 'Tokens',
  smb: 'Export SMB',
  monitoring: 'Monitoring SMB',
  email: 'Modèles d\'emails',
  pdf: 'Modèles PDF',
  contestations: 'Contestations',
  filiales: 'Filiales',
  catalogue: 'Équipements',
  utilisateurs: 'Collaborateurs',
  'ldap-sync': 'Active Directory',
  audit: 'Journal d\'audit',
};

// Segments qui ne sont pas des pages navigables (redirects ou wrappers)
const NON_NAVIGABLE = new Set(['admin']);

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  // Don't show breadcrumbs for top-level admin pages (e.g. /admin/contestations)
  if (segments.length <= 2 && segments[0] === 'admin') return null;

  // Skip the "admin" prefix — it's always implied by the sidebar context
  const displaySegments = segments[0] === 'admin' ? segments.slice(1) : segments;

  if (displaySegments.length <= 1) return null;

  const crumbs = displaySegments.map((segment, index) => {
    const path = '/admin/' + displaySegments.slice(0, index + 1).join('/');
    const label = LABELS[segment] || segment;
    const isLast = index === displaySegments.length - 1;
    const isNavigable = !NON_NAVIGABLE.has(segment) && !isLast;

    return { path, label, isLast, isNavigable };
  });

  return (
    <nav aria-label="Fil d'Ariane" className="mb-4">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map(({ path, label, isLast, isNavigable }) => (
          <li key={path} className="flex items-center gap-1">
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : isNavigable ? (
              <>
                <Link
                  to={path}
                  className="hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
                <ChevronRight className="h-3 w-3" />
              </>
            ) : (
              <>
                <span>{label}</span>
                <ChevronRight className="h-3 w-3" />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
