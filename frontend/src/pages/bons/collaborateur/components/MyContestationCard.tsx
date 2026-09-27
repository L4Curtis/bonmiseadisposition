import { AlertOctagon } from 'lucide-react';
import type { MyContestation } from '@/contracts/contestations';
import { formatDateLong } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  contestationFollowUp,
  contestedDocumentPhrase,
  FollowUpTone,
  outcomeExplanation,
} from '@/pages/portail/lib/contestation-follow-up';

const TONE_CLASSES: Readonly<Record<FollowUpTone, string>> = {
  waiting: 'bg-warning/10 text-warning',
  in_progress: 'bg-primary/10 text-primary',
  founded: 'bg-success/10 text-success',
  not_retained: 'bg-muted text-foreground',
};

/** « Ma contestation » : date, document, motif, où elle en est, et la réponse
 *  de l'équipe informatique (R-055). */
export function MyContestationCard({ contestation }: { contestation: MyContestation }) {
  const followUp = contestationFollowUp(contestation);
  const explanation = outcomeExplanation(contestation);
  return (
    <section aria-labelledby="ma-contestation" className="rounded-xl border border-destructive/30 bg-card p-4 space-y-3 shadow-sm">
      <h2 id="ma-contestation" className="flex items-center gap-2 font-semibold">
        <AlertOctagon className="h-4 w-4 text-destructive" /> Ma contestation
      </h2>
      <p className="text-sm text-muted-foreground">
        Le {formatDateLong(contestation.createdAt)}, vous avez contesté {contestedDocumentPhrase(contestation.contestedDocument)}
        {' '}:
      </p>
      <blockquote className="border-l-4 border-destructive/40 pl-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {contestation.message}
      </blockquote>
      <p className={cn('inline-flex rounded-full px-3 py-1 text-sm font-medium', TONE_CLASSES[followUp.tone])}>{followUp.label}</p>
      {contestation.resolutionMessage && (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Réponse de l'équipe informatique</p>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{contestation.resolutionMessage}</p>
        </div>
      )}
      {explanation && <p className="text-sm">{explanation}</p>}
    </section>
  );
}
