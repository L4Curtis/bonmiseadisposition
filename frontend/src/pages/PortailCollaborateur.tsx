import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Clock, CheckCircle2, Archive, ExternalLink, AlertOctagon, XCircle, ChevronRight } from 'lucide-react';
import { type BonStatus } from '@/types';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateLong } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ContestationDialog } from '@/components/ContestationDialog';

interface SignatureInfo {
  id: string;
  type: string;
  signed: boolean;
  token: string;
  tokenExpiresAt: string | null | undefined;
}

interface BonCollab {
  id: string;
  reference: string;
  status: BonStatus;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  filiale: { displayName: string };
  equipments: { id: string }[];
  signatures: SignatureInfo[];
}

/** Check if a bon has an unsigned, non-expired token for pv_cloture */
function hasPendingPvCloture(bon: BonCollab): boolean {
  return bon.signatures?.some(
    (s) => s.type === 'pv_cloture' && !s.signed && !!s.tokenExpiresAt && new Date(s.tokenExpiresAt) > new Date(),
  ) ?? false;
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function BonsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-36" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export function PortailCollaborateur() {
  const navigate = useNavigate();
  const [bons, setBons] = useState<BonCollab[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contestingBon, setContestingBon] = useState<BonCollab | null>(null);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    api.get<BonCollab[]>('/bons/mes-bons')
      .then(setBons)
      .catch((e: unknown) => { setBons([]); setLoadError(e instanceof Error ? e.message : 'Erreur lors du chargement'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const handleContestationSuccess = () => {
    toast({ title: 'Contestation envoyée', description: 'Le service IT va traiter votre demande.', variant: 'success' });
    reload();
  };

  if (loading) return (
    <div className="space-y-6 ">
      <Skeleton className="h-8 w-48" />
      <BonsSkeleton />
    </div>
  );

  if (loadError) return (
    <div className="">
      <Card className="border-destructive/30">
        <CardContent className="p-8 text-center" role="alert">
          <XCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={reload} className="mt-4">Réessayer</Button>
        </CardContent>
      </Card>
    </div>
  );

  // Bons à signer : sent_mise_dispo, sent_restitution, et partially_returned avec PV en attente
  const pending = bons.filter((b) =>
    ['sent_mise_dispo', 'sent_restitution'].includes(b.status) ||
    (b.status === 'partially_returned' && hasPendingPvCloture(b)),
  );
  const active = bons.filter((b) => b.status === 'active');
  const contested = bons.filter((b) => b.status === 'contested');
  const activeStatuses = new Set(['sent_mise_dispo', 'sent_restitution', 'active', 'contested']);
  const others = bons.filter((b) =>
    !activeStatuses.has(b.status) &&
    !(b.status === 'partially_returned' && hasPendingPvCloture(b)),
  );

  return (
    <div className="space-y-6 ">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes équipements</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {bons.length} bon{bons.length > 1 ? 's' : ''} associé{bons.length > 1 ? 's' : ''} à votre compte
        </p>
      </div>

      {bons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Vous n'avez aucun bon pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* À signer */}
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-orange-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> À signer ({pending.length})
              </h2>
              <div className="space-y-3">
                {pending.map((bon) => {
                  const pendingSig = bon.signatures?.find((s) => !s.signed && !!s.tokenExpiresAt && new Date(s.tokenExpiresAt) > new Date());
                  const isPvCloture = bon.status === 'partially_returned';
                  const sigType = isPvCloture
                    ? 'procès-verbal d\'équipements non restitués'
                    : bon.status === 'sent_restitution' ? 'restitution' : 'mise à disposition';
                  return (
                    <Card key={bon.id} className="border-orange-200 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-950/10">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-foreground">{bon.reference}</span>
                            <StatusBadge status={bon.status} signatures={bon.signatures} />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/mes-bons/${bon.id}`)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Détails <ChevronRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-sm text-orange-700 dark:text-orange-400">
                          Bon de <strong>{sigType}</strong> en attente de signature.
                        </p>
                        {pendingSig ? (
                          <Button asChild className="bg-orange-600 hover:bg-orange-700">
                            <a href={'/signer/' + pendingSig.token}>
                              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Signer maintenant
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Lien non disponible — contactez le service IT</span>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Actifs */}
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> En cours ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map((bon) => (
                  <Card key={bon.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/mes-bons/${bon.id}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-sm font-semibold text-foreground">{bon.reference}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{bon.filiale.displayName}</p>
                          <p className="text-xs text-muted-foreground">Depuis le {formatDateLong(bon.dateMiseDisposition)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <StatusBadge status={bon.status} signatures={bon.signatures} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setContestingBon(bon); }}
                            className="text-destructive border-destructive/30 hover:bg-destructive/5"
                          >
                            <AlertOctagon className="mr-1.5 h-3.5 w-3.5" /> Contester
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Contestés */}
          {contested.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertOctagon className="h-3.5 w-3.5" /> En contestation ({contested.length})
              </h2>
              <div className="space-y-2">
                {contested.map((bon) => (
                  <Card key={bon.id} className="border-destructive/20 bg-destructive/5 cursor-pointer hover:border-destructive/40 transition-colors" onClick={() => navigate(`/mes-bons/${bon.id}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-mono text-sm font-semibold text-foreground">{bon.reference}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{bon.filiale.displayName}</p>
                        </div>
                        <StatusBadge status={bon.status} signatures={bon.signatures} />
                      </div>
                      <p className="text-xs text-destructive mt-2">Contestation en cours d'examen par le service IT.</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Historique */}
          {others.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Archive className="h-3.5 w-3.5" /> Historique ({others.length})
              </h2>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Historique des bons">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Référence</th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Filiale</th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Statut</th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                          <th className="px-4 py-2.5 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {others.map((bon) => (
                          <tr
                            key={bon.id}
                            className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                            onClick={() => navigate(`/mes-bons/${bon.id}`)}
                          >
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold">{bon.reference}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{bon.filiale.displayName}</td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={bon.status} signatures={bon.signatures} />
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDateLong(bon.dateMiseDisposition)}</td>
                            <td className="px-4 py-2.5">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}

      <ContestationDialog
        bonId={contestingBon?.id ?? null}
        bonRef={contestingBon?.reference}
        open={!!contestingBon}
        onOpenChange={(open) => { if (!open) setContestingBon(null); }}
        onSuccess={handleContestationSuccess}
      />
    </div>
  );
}
