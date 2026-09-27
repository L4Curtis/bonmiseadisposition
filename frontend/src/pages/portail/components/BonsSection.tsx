import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertOctagon, ChevronRight } from 'lucide-react';
import type { PortalBon } from '@/contracts/bons';
import type { MyContestation } from '@/contracts/contestations';
import { bonStatusLabel } from '@/domain/labels';
import { formatDateLong } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { contestationFollowUp } from '../lib/contestation-follow-up';
import type { ContestTarget } from '../hooks/usePortal';

export type BonsSectionKind = 'current' | 'contested' | 'history';

interface BonsSectionProps {
  kind: BonsSectionKind;
  title: string;
  icon: ReactNode;
  bons: readonly PortalBon[];
  contestationOf: (bonId: string) => MyContestation | undefined;
  onContest: (target: ContestTarget) => void;
}

const HEADING_TONE: Readonly<Record<BonsSectionKind, string>> = {
  current: 'text-success',
  contested: 'text-destructive',
  history: 'text-muted-foreground',
};

function heldCount(bon: PortalBon): number {
  return bon.equipments.filter((eq) => (eq.returnState ? eq.returnState === 'out' : !eq.returnedAt && !eq.notReturned)).length;
}

/** Ligne propre à la section : matériel encore chez soi, suivi de la
 *  contestation, ou bon remplacé. */
function Detail({ kind, bon, contestation }: { kind: BonsSectionKind; bon: PortalBon; contestation?: MyContestation }) {
  if (kind === 'contested' && contestation) {
    return <p className="text-sm text-destructive">{contestationFollowUp(contestation).label}</p>;
  }
  if (kind === 'current') {
    const held = heldCount(bon);
    return held > 0 ? (
      <p className="text-sm text-muted-foreground">
        {held} équipement{held > 1 ? 's' : ''} chez vous
      </p>
    ) : null;
  }
  if (bon.replacedBy) return <p className="text-sm text-muted-foreground">Remplacé par le bon {bon.replacedBy.reference}</p>;
  return null;
}

function BonCard({ kind, bon, contestationOf, onContest }: Omit<BonsSectionProps, 'title' | 'icon' | 'bons'> & { bon: PortalBon }) {
  return (
    <li className="rounded-xl border bg-card shadow-sm">
      <Link to={`/mes-bons/${bon.id}`} className="flex min-h-11 items-start justify-between gap-3 p-4 hover:bg-muted/30 rounded-xl">
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-sm font-semibold text-foreground">{bon.reference}</p>
          <p className="text-sm text-muted-foreground">
            {bonStatusLabel(bon.status)} · {bon.filiale.displayName}
          </p>
          <p className="text-xs text-muted-foreground">Remis le {formatDateLong(bon.dateMiseDisposition)}</p>
          <Detail kind={kind} bon={bon} contestation={contestationOf(bon.id)} />
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      {kind === 'current' && bon.status === 'active' && !bon.replacedBy && (
        <div className="border-t px-4 py-2">
          <button
            type="button"
            onClick={() => onContest({ bon, document: 'mise_disposition' })}
            className="min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/5 sm:w-auto sm:px-3"
          >
            <AlertOctagon className="h-4 w-4" /> Contester
            <span className="sr-only"> le bon {bon.reference}</span>
          </button>
        </div>
      )}
    </li>
  );
}

/** Une section de bons du portail : en cours, contestés, ou historique — des
 *  cartes empilées, jamais un tableau qui défile de côté (R-094). */
export function BonsSection(props: BonsSectionProps) {
  const { kind, title, icon, bons } = props;
  return (
    <section aria-label={title}>
      <h2 className={cn('text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5', HEADING_TONE[kind])}>
        {icon} {title} ({bons.length})
      </h2>
      <ul className="grid gap-2 lg:grid-cols-2">
        {bons.map((bon) => (
          <BonCard key={bon.id} kind={kind} bon={bon} contestationOf={props.contestationOf} onContest={props.onContest} />
        ))}
      </ul>
    </section>
  );
}
