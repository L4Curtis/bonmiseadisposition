import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Search, ChevronLeft, ChevronRight, Shield, ExternalLink, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  bon_created:           { label: 'Bon créé',            color: 'bg-blue-100 text-blue-700' },
  bon_sent:              { label: 'Bon envoyé',           color: 'bg-indigo-100 text-indigo-700' },
  bon_cancelled:         { label: 'Bon annulé',           color: 'bg-red-100 text-red-700' },
  bon_signed:            { label: 'Bon signé',            color: 'bg-green-100 text-green-700' },
  bon_signed_in_person:  { label: 'Signé présentiel',     color: 'bg-amber-100 text-amber-700' },
  it_cachet_signed:      { label: 'Cachet IT',            color: 'bg-slate-100 text-slate-700' },
  restitution_initiated: { label: 'Restitution initiée',  color: 'bg-purple-100 text-purple-700' },
  bon_archived:          { label: 'Bon archivé',          color: 'bg-slate-100 text-slate-600' },
  reminder_sent:         { label: 'Rappel envoyé',        color: 'bg-orange-100 text-orange-700' },
  config_updated:        { label: 'Config modifiée',      color: 'bg-yellow-100 text-yellow-700' },
  ldap_sync:             { label: 'Sync LDAP',            color: 'bg-cyan-100 text-cyan-700' },
};

function actionBadge(action: string) {
  const meta = ACTION_LABELS[action] ?? { label: action, color: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
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
      .catch((e: any) => setLoadError(e?.message ?? 'Erreur lors du chargement des logs'))
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
        <Shield className="h-5 w-5 text-slate-400" />
        <h1 className="text-xl font-bold text-slate-900">Logs d'audit</h1>
        {data && (
          <span className="text-sm text-slate-400">
            ({data.total} entrée{data.total > 1 ? 's' : ''})
          </span>
        )}
      </div>

      {/* Filtres */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-1.5 rounded-md border bg-white px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              className="flex-1 text-sm outline-none placeholder:text-slate-400"
              placeholder="Email utilisateur..."
              value={userEmailInput}
              onChange={(e) => setUserEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
            />
          </div>

          <select
            className="rounded-md border bg-white px-3 py-2 text-sm"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
          >
            <option value="">Toutes les actions</option>
            {availableActions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
            ))}
          </select>

          <input
            type="date"
            className="rounded-md border bg-white px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            title="Date depuis"
          />

          <input
            type="date"
            className="rounded-md border bg-white px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            title="Date jusqu'au"
          />
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={applySearch}>Rechercher</Button>
          <Button size="sm" variant="outline" onClick={resetFilters}>Réinitialiser</Button>
        </div>
      </div>

      {/* Erreur de chargement */}
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-700">{loadError}</p>
          <button onClick={load} className="mt-3 text-sm font-medium text-red-600 underline hover:text-red-800">Réessayer</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : !data?.logs.length ? (
          <div className="py-12 text-center text-sm text-slate-400">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Aucune entrée trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">Date/Heure</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Utilisateur</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Bon</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">IP</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Détails</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">{actionBadge(log.action)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {log.user ? (
                        <div>
                          <div className="font-medium text-slate-700">{log.user.displayName}</div>
                          <div className="text-slate-400">{log.userEmail ?? log.user.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">{log.userEmail ?? '—'}</span>
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
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">
                      {log.ipAddress ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs">
                      {log.details ? (
                        <pre className="truncate text-xs bg-slate-50 rounded px-1.5 py-0.5 border text-slate-600 max-w-[200px]">
                          {JSON.stringify(log.details)}
                        </pre>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{data?.total} entrée{(data?.total ?? 0) > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">Page {page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
