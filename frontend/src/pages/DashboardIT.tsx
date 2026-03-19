import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  FileText, Clock, CheckCircle, AlertTriangle, Plus,
  ArchiveIcon, Building2, TrendingUp,
} from 'lucide-react';
import { BON_STATUS_LABELS, BON_STATUS_COLORS, type BonStatus } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  waitingSignature: number;
  active: number;
  overdue: number;
  total: number;
  archivedThisMonth: number;
  byFiliale: { id: string; name: string; count: number }[];
}

interface RecentBon {
  id: string;
  reference: string;
  status: BonStatus;
  dateMiseDisposition: string;
  updatedAt: string;
  collaborateur: { displayName: string; email: string };
  filiale: { displayName: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | undefined | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isOverdue(bon: RecentBon) {
  if (!['sent_mise_dispo', 'sent_restitution'].includes(bon.status)) return false;
  return new Date(bon.updatedAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function DashboardIT() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentBon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Stats>('/bons/stats'),
      api.get<RecentBon[]>('/bons/recent?limit=10'),
    ]).then(([s, r]) => {
      setStats(s);
      setRecent(r);
    }).finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      label: 'En attente de signature',
      value: stats?.waitingSignature ?? '—',
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      onClick: () => navigate('/bons?status=sent_mise_dispo'),
    },
    {
      label: 'Bons actifs',
      value: stats?.active ?? '—',
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-100',
      onClick: () => navigate('/bons?status=active'),
    },
    {
      label: 'En retard (> 7 j)',
      value: stats?.overdue ?? '—',
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-100',
      onClick: () => navigate('/bons'),
    },
    {
      label: 'Bons en cours',
      value: stats?.total ?? '—',
      icon: FileText,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      onClick: () => navigate('/bons'),
    },
    {
      label: 'Archivés ce mois',
      value: stats?.archivedThisMonth ?? '—',
      icon: ArchiveIcon,
      color: 'text-slate-600',
      bg: 'bg-slate-50',
      border: 'border-slate-100',
      onClick: () => navigate('/bons?status=archived'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="text-sm text-slate-400 mt-0.5">Vue d'ensemble des bons de mise à disposition</p>
        </div>
        <button
          onClick={() => navigate('/bons/new')}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nouveau bon
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(({ label, value, icon: Icon, color, bg, border, onClick }) => (
          <button
            key={label}
            className={`text-left rounded-xl border ${border} bg-white p-4 shadow-sm hover:shadow-md transition-shadow`}
            onClick={onClick}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`rounded-full ${bg} p-2.5 shrink-0`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-0.5 text-xs text-slate-500 leading-tight">{label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Bons récents */}
        <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900 text-sm">Activité récente</h2>
            </div>
            <button onClick={() => navigate('/bons')} className="text-xs text-blue-600 hover:underline">
              Voir tout
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Aucun bon créé pour l'instant</p>
              <button className="mt-2 text-blue-600 hover:underline" onClick={() => navigate('/bons/new')}>
                Créer le premier bon
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {recent.map((bon) => {
                const late = isOverdue(bon);
                return (
                  <button
                    key={bon.id}
                    className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    onClick={() => navigate(`/bons/${bon.id}`)}
                  >
                    {late && (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-700">{bon.reference}</span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BON_STATUS_COLORS[bon.status]}`}>
                          {BON_STATUS_LABELS[bon.status]}
                        </span>
                        {late && <span className="text-xs text-red-500">En retard</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {bon.collaborateur.displayName} · {bon.filiale.displayName}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatDate(bon.dateMiseDisposition)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Par filiale */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-3.5">
            <Building2 className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900 text-sm">Bons actifs par filiale</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : !stats?.byFiliale?.length ? (
            <div className="p-6 text-center text-xs text-slate-400">Aucune donnée</div>
          ) : (
            <div className="divide-y">
              {stats.byFiliale.map((f) => {
                const maxCount = Math.max(...stats.byFiliale.map((x) => x.count), 1);
                const pct = Math.round((f.count / maxCount) * 100);
                return (
                  <button
                    key={f.id}
                    className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors"
                    onClick={() => navigate(`/bons?filialeId=${f.id}`)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-700 font-medium truncate">{f.name}</span>
                      <span className="text-xs font-bold text-slate-900 ml-2">{f.count}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
