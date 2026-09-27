import { Link } from 'react-router';
import { Gavel, MailQuestion, MessageSquareWarning } from 'lucide-react';
import type { BonContestationNotice, BonLinkRequest } from '@/contracts';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { CONTESTATION_PARAM } from '@/pages/admin/contestations/useContestations';
import { documentInSentence } from './bon-lexicon';
import type { BonFiche } from './types';

/** Écran IT des contestations (liste « À traiter » par défaut). */
export const CONTESTATIONS_PATH = '/admin/contestations';

function ContestationNotice({ notice }: { notice: BonContestationNotice }) {
  const what = notice.contestedDocument ? documentInSentence(notice.contestedDocument) : 'le bon';
  const title = notice.stage === 'open'
    ? `Contestation de ${what}, reçue le ${formatDateTime(notice.createdAt)}`
    : `Contestation de ${what} jugée fondée le ${formatDateTime(notice.resolvedAt)}`;
  return (
    <div role="status" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <p className="flex items-start gap-2 font-medium text-foreground">
        <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span>{title}</span>
      </p>
      <blockquote className="break-words border-l-2 border-warning/60 pl-3 text-foreground/90">« {notice.message} »</blockquote>
      {notice.stage === 'open' && notice.reviewedBy && (
        <p className="text-xs text-muted-foreground">Prise en charge par {notice.reviewedBy.displayName}.</p>
      )}
      {notice.stage === 'correction' && notice.resolutionMessage && (
        <p className="text-xs text-muted-foreground">Votre réponse : {notice.resolutionMessage}</p>
      )}
    </div>
  );
}

function LinkRequestNotice({ request, name }: { request: BonLinkRequest; name: string }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
      <MailQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        {name} a demandé un nouveau lien pour {documentInSentence(request.documentType)} le{' '}
        {formatDateTime(request.requestedAt)}.
      </span>
    </p>
  );
}

/** Rappels du panneau « À faire maintenant » : contestation à traiter ou à
 *  corriger, demande de nouveau lien du collaborateur (S26). */
export function BonActionNotices({ bon }: { bon: BonFiche }) {
  const notice = bon.contestation ?? null;
  const request = bon.linkRequest ?? null;
  if (!notice && !request) return null;
  return (
    <div className="space-y-2">
      {notice && <ContestationNotice notice={notice} />}
      {request && <LinkRequestNotice request={request} name={bon.collaborateur.displayName} />}
    </div>
  );
}

/** « Traiter la contestation » : action principale d'un bon contesté, qui
 *  ouvre directement la fenêtre de décision de cette contestation. */
export function HandleContestationButton({ contestationId, className }: { contestationId: string; className?: string }) {
  const search = new URLSearchParams({ [CONTESTATION_PARAM]: contestationId });
  return (
    <Button asChild size="sm" className={className}>
      <Link to={`${CONTESTATIONS_PATH}?${search}`}>
        <Gavel className="h-3.5 w-3.5" aria-hidden="true" /> Traiter la contestation
      </Link>
    </Button>
  );
}
