import { AlarmClock, Clock } from 'lucide-react';
import type { BonLateness, BonSubStatus } from '@/contracts';
import { BON_STATUS_COLORS, type BonStatus } from '@/types';
import { LATENESS_LABELS, bonStatusLabel, bonSubStatusLabel } from '@/domain/labels';

export interface BonStateBadgesProps {
  readonly status: BonStatus;
  /** Sous-état de « Restitution en cours », calculé par le serveur. */
  readonly subStatus?: BonSubStatus | null;
  /** Retards calculés par le serveur. */
  readonly lateness?: BonLateness;
  /** Un document attend la signature du collaborateur. */
  readonly awaitingSignature?: boolean;
}

function days(count: number): string {
  return `${count} j`;
}

/**
 * Statut d'un bon, avec son sous-état et ses retards (« Signature en retard »,
 * « Retour en retard », toujours qualifiés et chiffrés) : même affichage sur
 * la fiche et dans la liste. Tout vient du serveur, rien n'est recalculé ici.
 */
export function BonStateBadges({ status, subStatus, lateness, awaitingSignature }: BonStateBadgesProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${BON_STATUS_COLORS[status]}`}>
        {awaitingSignature
          ? <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          : <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
        {bonStatusLabel(status)}
      </span>
      {subStatus && (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {bonSubStatusLabel(subStatus)}
        </span>
      )}
      {lateness?.signatureDays != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
          <AlarmClock className="h-3 w-3" aria-hidden="true" />
          {LATENESS_LABELS.signature} ({days(lateness.signatureDays)})
        </span>
      )}
      {lateness?.returnDays != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <AlarmClock className="h-3 w-3" aria-hidden="true" />
          {LATENESS_LABELS.return} ({days(lateness.returnDays)})
        </span>
      )}
    </span>
  );
}
