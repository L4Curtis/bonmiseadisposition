import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';
import { BarChart3, Package, Clock, Download, Loader2, MailWarning } from 'lucide-react';

interface Overview {
  circulating: {
    totalEquipments: number;
    totalBons: number;
    byCategory: { category: string; label: string; count: number }[];
    byFiliale: { name: string; count: number }[];
  };
  overdue: {
    count: number;
    thresholdDays: number;
    items: { id: string; reference: string; collaborateur: string; email: string; department: string; filiale: string; days: number }[];
    byDepartment: { name: string; count: number }[];
  };
  monthly: { month: string; created: number; archived: number }[];
  failedNotifications: {
    count: number;
    windowDays: number;
    items: { id: string; bonId: string | null; reference: string; recipient: string; type: string; sentAt: string; error: string }[];
  };
}

const NOTIF_TYPE_LABELS: Record<string, string> = {
  mise_dispo_request: 'Demande de signature (mise à dispo)',
  restitution_request: 'Demande de signature (restitution)',
  pv_cloture_request: 'Demande de signature (PV)',
  reminder: 'Rappel',
  confirmation: 'Confirmation',
  contestation_alert: 'Alerte contestation',
  contestation_resolution: 'Résolution contestation',
  cancellation: 'Annulation',
  mark_found: 'Équipement retrouvé',
  unilateral_closure: 'Clôture unilatérale',
};

function StatCard({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
          {hint && <p className="text-[10px] text-muted-foreground/60">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownList({ rows, max }: { rows: { name: string; count: number }[]; max: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground/70">Aucune donnée.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground">{r.name}</span>
            <span className="font-medium text-muted-foreground">{r.count}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get<Overview>('/reports/overview').then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.getBlob('/reports/circulating.csv');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parc-en-circulation-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Export impossible', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-destructive">Impossible de charger le reporting.</p>;

  const catMax = Math.max(1, ...data.circulating.byCategory.map((c) => c.count));
  const filMax = Math.max(1, ...data.circulating.byFiliale.map((f) => f.count));
  const monthMax = Math.max(1, ...data.monthly.map((m) => Math.max(m.created, m.archived)));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Reporting</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Parc en circulation, retards de signature et tendance mensuelle.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Exporter le parc (CSV)
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="Équipements en circulation" value={data.circulating.totalEquipments} hint={`${data.circulating.totalBons} bon(s) actif(s)`} />
        <StatCard icon={Clock} label="Bons en retard de signature" value={data.overdue.count} hint={`> ${data.overdue.thresholdDays} jours`} />
        <StatCard icon={MailWarning} label="Emails non délivrés (30 j)" value={data.failedNotifications.count} />
        <StatCard icon={BarChart3} label="Bons créés (mois en cours)" value={data.monthly[data.monthly.length - 1]?.created ?? 0} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Parc par catégorie</CardTitle></CardHeader>
          <CardContent>
            <BreakdownList rows={data.circulating.byCategory.map((c) => ({ name: c.label, count: c.count }))} max={catMax} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Parc par filiale</CardTitle></CardHeader>
          <CardContent>
            <BreakdownList rows={data.circulating.byFiliale} max={filMax} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Tendance — 12 derniers mois (créés / archivés)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-40">
            {data.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${m.month} — ${m.created} créés, ${m.archived} archivés`}>
                <div className="flex w-full items-end justify-center gap-0.5 h-32">
                  <div className="w-1/2 rounded-t bg-primary" style={{ height: `${Math.round((m.created / monthMax) * 100)}%` }} />
                  <div className="w-1/2 rounded-t bg-muted-foreground/40" style={{ height: `${Math.round((m.archived / monthMax) * 100)}%` }} />
                </div>
                <span className="text-[9px] text-muted-foreground/70 rotate-0">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-primary" /> Créés</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/40" /> Archivés</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Bons en retard de signature</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.overdue.items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground/70">Aucun retard 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Référence</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Collaborateur</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Service</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Filiale</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Jours</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overdue.items.slice(0, 50).map((it) => (
                    <tr key={it.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{it.reference}</td>
                      <td className="px-4 py-2">{it.collaborateur}</td>
                      <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{it.department || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{it.filiale || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium text-orange-600">{it.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.failedNotifications.count > 0 && (
        <Card className="border-amber-300/60">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <MailWarning className="h-4 w-4" /> Emails non délivrés (30 derniers jours)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              Ces destinataires n’ont pas reçu l’email — un lien de signature non reçu laisse le bon en attente. Vérifiez l’adresse ou renvoyez le lien.
            </p>
            <div className="overflow-x-auto p-4 pt-2">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Bon</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Destinataire</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Quand</th>
                  </tr>
                </thead>
                <tbody>
                  {data.failedNotifications.items.slice(0, 50).map((n) => (
                    <tr key={n.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">
                        {n.bonId ? <a href={`/bons/${n.bonId}`} className="text-primary hover:underline">{n.reference}</a> : n.reference}
                      </td>
                      <td className="px-3 py-2">{NOTIF_TYPE_LABELS[n.type] ?? n.type}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{n.recipient}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{formatDateTime(n.sentAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
