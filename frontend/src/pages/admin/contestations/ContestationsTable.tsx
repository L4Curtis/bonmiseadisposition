import { Link } from 'react-router';
import { CheckCircle, Eye, Loader2 } from 'lucide-react';
import type { ContestationListItem } from '@/contracts/contestations';
import { ListColumn, ListState, ResponsiveList } from '@/components/list';
import { formatDate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  contestationAgeDays,
  contestationFollowUpForIt,
  contestedDocumentLabel,
  isOverdue,
  isPending,
} from './contestation-meta';

interface ContestationsTableProps {
  contestations: readonly ContestationListItem[] | undefined;
  /** Seuil de retard calculé par le serveur (7 jours ouvrés). */
  overdueSince: string | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  reviewingId: string | null;
  onReview: (contestation: ContestationListItem) => void;
  onDecide: (contestation: ContestationListItem) => void;
}

const ACTION = 'w-full whitespace-nowrap min-h-11 sm:min-h-8 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors';

function Received({ c, overdueSince }: { c: ContestationListItem; overdueSince: string | null }) {
  const days = contestationAgeDays(c.createdAt);
  const late = isOverdue(c, overdueSince);
  return (
    // Date et ancienneté l'une sous l'autre : la colonne reste étroite et les
    // actions tiennent à l'écran dès 1280 px.
    <span className="flex flex-col items-start gap-1 whitespace-nowrap">
      {formatDate(c.createdAt)}
      {isPending(c) && (
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', late ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
          {days} j{late ? ' — en retard' : ''}
        </span>
      )}
    </span>
  );
}

function Actions({ c, reviewingId, onReview, onDecide }: { c: ContestationListItem } & Pick<ContestationsTableProps, 'reviewingId' | 'onReview' | 'onDecide'>) {
  if (!isPending(c)) {
    return c.resolutionMessage ? (
      <p className="text-xs text-muted-foreground italic [overflow-wrap:anywhere]">« {c.resolutionMessage} »</p>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-2">
      {c.status === 'open' && (
        <button type="button" onClick={() => onReview(c)} disabled={reviewingId === c.id} className={cn(ACTION, 'bg-warning/10 text-warning hover:bg-warning/20')}>
          {reviewingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Prendre en charge
        </button>
      )}
      <button type="button" onClick={() => onDecide(c)} className={cn(ACTION, 'bg-primary/10 text-primary hover:bg-primary/20')}>
        <CheckCircle className="h-4 w-4" /> Trancher
      </button>
    </div>
  );
}

function columns(props: ContestationsTableProps): ListColumn<ContestationListItem>[] {
  return [
    {
      key: 'bon',
      header: 'Bon',
      card: 'title',
      className: 'whitespace-nowrap',
      cell: (c) => (
        <Link to={`/bons/${c.bon.id}`} className="inline-flex min-h-11 items-center font-mono font-semibold text-primary hover:underline sm:min-h-0">
          {c.bon.reference}
        </Link>
      ),
    },
    { key: 'received', header: 'Reçue le', cell: (c) => <Received c={c} overdueSince={props.overdueSince} /> },
    {
      key: 'who',
      header: 'Collaborateur et document',
      cell: (c) => (
        <span>
          {c.user.displayName}
          <span className="block text-xs text-muted-foreground">
            {contestedDocumentLabel(c)} · {c.bon.filiale.displayName}
          </span>
        </span>
      ),
    },
    {
      key: 'message',
      header: 'Motif',
      className: 'min-w-[12rem]',
      cell: (c) => <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{c.message}</p>,
    },
    { key: 'follow', header: 'Suivi', className: 'min-w-[9rem]', cell: (c) => <span className="text-sm">{contestationFollowUpForIt(c)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      card: 'actions',
      className: 'w-48',
      cell: (c) => <Actions c={c} reviewingId={props.reviewingId} onReview={props.onReview} onDecide={props.onDecide} />,
    },
  ];
}

/** Liste des contestations : un tableau sur ordinateur, des cartes sur
 *  téléphone. Le motif est affiché en entier : c'est lui qu'on tranche. */
export function ContestationsTable(props: ContestationsTableProps) {
  const items = props.contestations ?? [];
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <ListState
        loading={props.loading}
        error={props.loadError}
        isEmpty={items.length === 0}
        onRetry={props.onRetry}
        emptyMessage="Aucune contestation dans cette liste."
      >
        <ResponsiveList items={items} columns={columns(props)} getKey={(c) => c.id} caption="Liste des contestations" />
      </ListState>
    </div>
  );
}
