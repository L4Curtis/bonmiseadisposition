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
import { BON_STATUS_LABELS, type BonStatus } from '@/types';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  action: string;
  userEmail?: string;
  ipAddress?: string;
  createdAt: string;
  details?: Record<string, unknown>;
  bon?: { id: string; reference: string } | null;
  // `resolved` = nom déduit de l'email côté backend (pas une vraie relation user)
  user?: { displayName: string; email: string; resolved?: boolean } | null;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

// ─── Action label mapping ─────────────────────────────────────────────────────

const BLUE = 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400';
const GREEN = 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400';
const RED = 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400';
const YELLOW = 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400';
const ORANGE = 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400';
const AMBER = 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400';
const PURPLE = 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400';
const INDIGO = 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400';
const CYAN = 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400';
const SLATE = 'bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400';
const MUTED = 'bg-muted text-muted-foreground';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  // Auth
  login_sso:                   { label: 'Connexion SSO',            color: BLUE },
  login_local_success:         { label: 'Connexion locale',         color: GREEN },
  login_local_failed:          { label: 'Tentative échouée',        color: RED },
  logout:                      { label: 'Déconnexion',              color: MUTED },
  password_changed:            { label: 'Mot de passe modifié',     color: YELLOW },
  // Bons — cycle de vie
  bon_created:                 { label: 'Bon créé',                 color: BLUE },
  bon_sent:                    { label: 'Bon envoyé',               color: INDIGO },
  bon_cancelled:               { label: 'Bon annulé',               color: RED },
  bon_closed_unilateral:       { label: 'Clôture unilatérale',      color: ORANGE },
  bon_corrected:               { label: 'Bon corrigé',              color: BLUE },
  bon_anonymized:              { label: 'Anonymisé (RGPD)',         color: SLATE },
  restitution_initiated:       { label: 'Restitution initiée',      color: PURPLE },
  declare_not_returned:        { label: 'Matériel non rendu',       color: ORANGE },
  declare_not_returned_partial:{ label: 'Non rendu (partiel)',      color: ORANGE },
  mark_found:                  { label: 'Matériel retrouvé',        color: GREEN },
  reminder_sent:               { label: 'Rappel envoyé',            color: ORANGE },
  pdf_snapshot_saved:          { label: 'Document PDF généré',      color: SLATE },
  // Signatures
  signed_mise_disposition:     { label: 'Signé — Mise à dispo',     color: GREEN },
  signed_restitution:          { label: 'Signé — Restitution',      color: GREEN },
  signed_pv_cloture:           { label: 'Signé — PV clôture',       color: GREEN },
  signed_it_cachet:            { label: 'Cachet IT',                color: SLATE },
  // Pièces jointes
  attachment_uploaded:         { label: 'Pièce jointe ajoutée',     color: CYAN },
  attachment_deleted:          { label: 'Pièce jointe supprimée',   color: RED },
  // Contestations
  bon_contested:               { label: 'Contestation créée',       color: AMBER },
  contestation_resolved:       { label: 'Contestation acceptée',    color: GREEN },
  contestation_rejected:       { label: 'Contestation refusée',     color: RED },
  // Admin
  config_updated:              { label: 'Config modifiée',          color: YELLOW },
  ldap_sync:                   { label: 'Sync LDAP',                color: CYAN },
  pdf_template_updated:        { label: 'Modèle PDF modifié',       color: YELLOW },
  pdf_template_reset:          { label: 'Modèle PDF réinitialisé',  color: MUTED },
  pdf_templates_imported:      { label: 'Modèles PDF importés',     color: YELLOW },
};

function actionMeta(action: string) {
  return ACTION_LABELS[action] ?? { label: action, color: MUTED };
}

function actionBadge(action: string) {
  const meta = actionMeta(action);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ─── Détails lisibles ───────────────────────────────────────────────────────

const SNAPSHOT_TYPE_LABELS: Record<string, string> = {
  signature_it_mise_disposition: 'Cachet IT (mise à dispo)',
  signature_collab_mise_disposition: 'Mise à dispo signée',
  signature_it_restitution: 'Cachet IT (restitution)',
  signature_collab_restitution: 'Restitution signée',
  cloture_equipements_manquants: 'PV équipements manquants',
  avenant_equipement_retrouve: 'Avenant équipement retrouvé',
};

const STAGE_LABELS: Record<string, string> = {
  mise_disposition: 'Mise à disposition',
  restitution: 'Restitution',
  pv_cloture: 'PV de clôture',
  general: 'Général',
};

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Transforme une paire clé/valeur de `details` en libellé lisible, ou null si
 *  c'est du bruit (clé technique, booléen faux). */
function formatDetailEntry(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  switch (key) {
    case 'type': return SNAPSHOT_TYPE_LABELS[String(value)] ?? String(value);
    case 'sha256': return `SHA-256 ${String(value).slice(0, 10)}…`;
    case 'newStatus':
    case 'currentStatus': return `Statut : ${BON_STATUS_LABELS[value as BonStatus] ?? String(value)}`;
    case 'isInPerson': return value ? 'Présentiel' : null;
    case 'signedByProxy': return value ? 'Mandataire' : null;
    case 'mentionLuApprouve': return value ? 'Lu & approuvé' : null;
    case 'manual': return value ? 'Manuel' : null;
    case 'remaining': return `${value} restant(s)`;
    case 'reason':
    case 'message': return `« ${truncate(String(value), 60)} »`;
    case 'stage': return STAGE_LABELS[String(value)] ?? String(value);
    case 'mimeType': return String(value);
    case 'size': return `${Math.max(1, Math.round(Number(value) / 1024))} Ko`;
    // Clés techniques masquées (redondantes / bruit)
    case 'filename':
    case 'titulaireEmail':
    case 'attachmentId': return null;
    default: return `${key} : ${truncate(String(value), 40)}`;
  }
}

function DetailCell({ details }: { details?: Record<string, unknown> }) {
  if (!details) return <span className="text-muted-foreground/70">—</span>;
  const chips = Object.entries(details)
    .map(([k, v]) => formatDetailEntry(k, v))
    .filter((x): x is string => !!x);
  if (chips.length === 0) return <span className="text-muted-foreground/70">—</span>;
  return (
    <div className="flex flex-wrap gap-1" title={JSON.stringify(details, null, 2)}>
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground whitespace-nowrap"
        >
          {c}
        </span>
      ))}
    </div>
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
        <h1 className="text-xl font-bold text-foreground">Journal d'audit</h1>
        {data && (
          <span className="text-sm text-muted-foreground/70">
            ({data.total} entrée{data.total > 1 ? 's' : ''})
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
            <Button size="sm" variant="outline" onClick={resetFilters}>Réinitialiser</Button>
          </div>
        </CardContent>
      </Card>

      {/* Erreur de chargement */}
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-6 text-center" role="alert">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load} className="mt-3 text-red-600 hover:text-red-800">
            Réessayer
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
              <p>Aucune entrée trouvée</p>
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Détails</th>
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
                        {(() => {
                          const name = log.user?.displayName;
                          const email = log.userEmail ?? log.user?.email ?? null;
                          if (!name && !email) return <span className="text-muted-foreground/70">{'\u2014'}</span>;
                          return (
                            <div className="leading-tight">
                              <div className="font-medium text-foreground/80">{name ?? email}</div>
                              {name && email && email !== name && (
                                <div className="text-muted-foreground/70">{email}</div>
                              )}
                            </div>
                          );
                        })()}
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
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-sm">
                        <DetailCell details={log.details} />
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
          <span>{data?.total} entrée{(data?.total ?? 0) > 1 ? 's' : ''}</span>
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
