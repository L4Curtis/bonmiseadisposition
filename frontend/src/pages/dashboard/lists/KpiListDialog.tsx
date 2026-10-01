import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import type { ApiResourceState } from '@/hooks/use-api-resource';
import { formatDateTime } from '@/lib/dates';
import { countWithUnit, periodLabel } from '../lib/kpi-scope';
import { KPI_LISTS, LIST_PARAM, type KpiListItem, type KpiListKey, type KpiListResponse } from './kpi-lists';
import { useKpiList } from './use-kpi-list';

const PAGE_SIZE = 50;

interface KpiListDialogProps {
  indicateur: KpiListKey;
  from: string;
  to: string;
  filialeId: string | null;
}

function ListRow({ item, dateLabel }: { item: KpiListItem; dateLabel: string }) {
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/bons/${item.bonId}`}
          className="inline-flex min-h-[44px] items-center font-mono text-xs font-medium text-foreground/80 hover:underline"
          aria-label={`Ouvrir le bon ${item.reference}`}
        >
          <span className="rounded bg-muted px-2 py-0.5">{item.reference}</span>
        </Link>
        <StatusBadge status={item.status} />
      </div>
      <p className="text-sm text-foreground/80">
        {item.collaborateur}
        <span className="text-xs text-muted-foreground"> · {item.filiale}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {`${dateLabel} ${formatDateTime(item.at)}`}
        {item.detail && <span className="text-foreground/70"> · {item.detail}</span>}
      </p>
    </li>
  );
}

function ListBody({ state, dateLabel }: { state: ApiResourceState<KpiListResponse>; dateLabel: string }) {
  if (state.error) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="alert">
        <p className="text-sm text-destructive">{state.error}</p>
        <Button type="button" variant="outline" size="sm" onClick={state.reload}>Réessayer</Button>
      </div>
    );
  }
  if (state.loading || !state.data) {
    return (
      <div className="space-y-3 py-2" aria-label="Chargement de la liste">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (state.data.items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Rien sur la période.</p>;
  }
  return (
    <ul className="divide-y divide-border" aria-label="Liste du chiffre">
      {state.data.items.map((item) => <ListRow key={item.id} item={item} dateLabel={dateLabel} />)}
    </ul>
  );
}

/**
 * Liste exacte d'un chiffre « sur la période » : autant de lignes que la
 * carte, pour la même période et la même filiale ; chaque ligne ouvre son
 * bon. Ouverte par le paramètre d'adresse `liste` (voir kpi-lists.ts), fermée
 * en le retirant. Défilement interne : l'en-tête et la croix restent visibles
 * sur téléphone, en portrait comme en paysage.
 */
export function KpiListDialog({ indicateur, from, to, filialeId }: KpiListDialogProps) {
  const [, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const meta = KPI_LISTS[indicateur];

  const query = new URLSearchParams({ indicateur, from, to, page: String(page), limit: String(PAGE_SIZE) });
  if (filialeId) query.set('filialeId', filialeId);
  const state = useKpiList(`/kpi/liste?${query.toString()}`);
  const total = state.data?.total ?? null;
  const pages = total === null ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  const close = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(LIST_PARAM);
      return next;
    }, { replace: true });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-xl flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="leading-snug">{meta.title}</DialogTitle>
          <DialogDescription>
            {total === null ? periodLabel({ from, to }) : `${countWithUnit(total, meta.unit)}, ${periodLabel({ from, to })}`}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ListBody state={state} dateLabel={meta.dateLabel} />
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" size="sm" className="min-h-[44px]" disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Précédent
            </Button>
            <span className="text-xs text-muted-foreground">{`Page ${page} sur ${pages}`}</span>
            <Button type="button" variant="outline" size="sm" className="min-h-[44px]" disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}>
              Suivant<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
