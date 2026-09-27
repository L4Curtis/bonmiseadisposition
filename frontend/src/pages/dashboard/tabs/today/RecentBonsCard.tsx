import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { useApiResource } from '@/hooks/use-api-resource';
import { formatDate } from '@/lib/dates';
import type { SignatureSummary } from '@/lib/bon-helpers';
import type { BonStatus } from '@/types';

/** Champs lus de `GET /bons/recent` (BonDetail). */
interface RecentBon {
  id: string;
  reference: string;
  status: BonStatus;
  createdAt: string;
  collaborateur: { displayName: string };
  signatures: SignatureSummary[];
}

function RecentSkeleton() {
  return (
    <div className="space-y-2 px-5 py-4">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}

/** Dix derniers bons créés, du plus récent au plus ancien ; la colonne de
 *  date est la date de création (celle du tri). */
export function RecentBonsCard() {
  const { data, loading, error, reload } = useApiResource<RecentBon[]>(
    '/bons/recent?limit=10',
    'Erreur lors du chargement des bons récents',
  );
  const bons = [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card card-elevated lg:col-span-2">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-foreground">Bons récents</h3>
        <Link to="/bons" className="inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Voir tout
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      {loading ? (
        <RecentSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={reload}>Réessayer</Button>
        </div>
      ) : bons.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <FileText className="h-6 w-6 text-muted-foreground/70" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground/80">Aucun bon créé pour l&apos;instant</p>
          <Button asChild variant="outline" size="sm" className="mt-2 gap-1.5">
            <Link to="/bons/new"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Créer un bon</Link>
          </Button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="px-4 py-2 sm:px-5">Bon</th>
              <th scope="col" className="hidden px-2 py-2 sm:table-cell">Statut</th>
              <th scope="col" className="px-4 py-2 text-right sm:px-5">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bons.map((bon) => (
              <tr key={bon.id} className="hover:bg-muted/40">
                <td className="px-4 py-2.5 sm:px-5">
                  <Link to={`/bons/${bon.id}`} className="flex min-h-[44px] flex-col justify-center gap-0.5">
                    <span className="font-mono text-xs font-semibold text-foreground/80">{bon.reference}</span>
                    <span className="break-words text-sm text-foreground/80">{bon.collaborateur.displayName}</span>
                    <span className="sm:hidden"><StatusBadge status={bon.status} signatures={bon.signatures} /></span>
                  </Link>
                </td>
                <td className="hidden px-2 py-2.5 sm:table-cell">
                  <StatusBadge status={bon.status} signatures={bon.signatures} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted-foreground sm:px-5">
                  {formatDate(bon.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
