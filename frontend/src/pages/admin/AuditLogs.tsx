import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Search, ChevronLeft, ChevronRight, Shield, ExternalLink, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  action: string;
  userEmail?: string;
  ipAddress?: string;
  createdAt: string;
  details?: Record<string, any>;
  bon?: { id: string; reference: string } | null;
  user?: { displayName: string; email: string } | null;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

// ─── Action label mapping ─────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  // Auth
  login_sso:                 { label: 'Connexion SSO',           color: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
  login_local_success:       { label: 'Connexion locale',        color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  login_local_failed:        { label: 'Tentative echouee',       color: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400' },
  logout:                    { label: 'Deconnexion',             color: 'bg-muted text-muted-foreground' },
  password_changed:          { label: 'Mot de passe modifie',    color: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' },
  // Bons — cycle de vie
  bon_created:               { label: 'Bon cree',                color: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
  bon_sent:                  { label: 'Bon envoye',              color: 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' },
  bon_cancelled:             { label: 'Bon annule',              color: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400' },
  restitution_initiated:     { label: 'Restitution initiee',     color: 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' },
  declare_not_returned:      { label: 'Materiel non rendu',      color: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400' },
  mark_found:                { label: 'Materiel retrouve',       color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  reminder_sent:             { label: 'Rappel envoye',           color: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400' },
  // Signatures
  signed_mise_disposition:   { label: 'Signe — Mise a dispo',    color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  signed_restitution:        { label: 'Signe — Restitution',     color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  signed_pv_cloture:         { label: 'Signe — PV cloture',      color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  signed_it_cachet:          { label: 'Cachet IT',               color: 'bg-muted text-foreground/80' },
  // Contestations
  bon_contested:             { label: 'Contestation creee',      color: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' },
  contestation_resolved:     { label: 'Contestation acceptee',   color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  contestation_rejected:     { label: 'Contestation refusee',    color: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400' },
  // Admin
  config_updated:            { label: 'Config modifiee',         color: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' },
  ldap_sync:                 { label: 'Sync LDAP',               color: 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400' },
};

function actionBadge(action: string) {
  const meta = ACTION_LABELS[action] ?? { label: action, color: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AuditLogsPage() {
  const navigate = useNavigate();

  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  const [userEmailInput, setUserEmailInput] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  useEffect(() => {
    api.get<string[]>('/audit/actions').then(setAvailableActions).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (userEmail) params.set('userEmail', userEmail);
    if (action) params.set('action', action);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('page', String(page));
    params.set('limit', String(limit));

    api.get<AuditResponse>(`/audit?${params}`)
      .then(setData)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Erreur lors du chargement des logs'))
      .finally(() => setLoading(false));
  }, [userEmail, action, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  const applySearch = () => { setUserEmail(userEmailInput); setPage(1); };
  const resetFilters = () => {
    setUserEmailInput(''); setUserEmail('');
    setAction(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-muted-foreground/70" />
        <h1 className="text-xl font-bold text-foreground">Logs d'audit</h1>
        {data && (
          <span className="text-sm text-muted-foreground/70">
            ({data.total} entree{data.total > 1 ? 's' : ''})
          </span>
        )}
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
              <Input
                className="pl-9"
                placeholder="Email utilisateur..."
                value={userEmailInput}
                onChange={(e) => setUserEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
              />
            </div>

            <Select
              value={action || '__all__'}
              onValueChange={(v) => { setAction(v === '__all__' ? '' : v); setPage(1); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes les actions</SelectItem>
                {availableActions.map((a) => (
                  <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              title="Date depuis"
            />

            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              title="Date jusqu'au"
            />
          </div>

          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={applySearch}>Rechercher</Button>
            <Button size="sm" variant="outline" onClick={resetFilters}>Reinitialiser</Button>
          </div>
        </CardContent>
      </Card>

      {/* Erreur de chargement */}
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-6 text-center" role="alert">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load} className="mt-3 text-red-600 hover:text-red-800">
            Reessayer
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : !data?.logs.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground/70">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Aucune entree trouvee</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Journal d'audit">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Date/Heure</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Utilisateur</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bon</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">{actionBadge(log.action)}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {log.user ? (
                          <div>
                            <div className="font-medium text-foreground/80">{log.user.displayName}</div>
                            <div className="text-muted-foreground/70">{log.userEmail ?? log.user.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/70">{log.userEmail ?? '\u2014'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {log.bon ? (
                          <button
                            className="flex items-center gap-1 font-mono font-semibold text-blue-600 hover:underline"
                            onClick={() => navigate(`/bons/${log.bon!.id}`)}
                          >
                            {log.bon.reference}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : <span className="text-muted-foreground/70">{'\u2014'}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground/70 font-mono">
                        {log.ipAddress ?? '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                        {log.details ? (
                          <pre className="truncate text-xs bg-muted/40 rounded px-1.5 py-0.5 border text-muted-foreground max-w-[200px]">
                            {JSON.stringify(log.details)}
                          </pre>
                        ) : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total} entree{(data?.total ?? 0) > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">Page {page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
