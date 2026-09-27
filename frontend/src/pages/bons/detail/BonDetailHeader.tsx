import { Link, useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { formatDateLong } from '@/lib/utils';
import { BonStateBadges } from '../components/BonStateBadges';
import type { BonFiche } from './types';

export interface BonDetailHeaderProps {
  readonly bon: BonFiche;
}

/** En-tête de la fiche : référence (sur une ligne), statut, sous-état,
 *  retards, et lien avec le bon remplacé ou remplaçant. */
export function BonDetailHeader({ bon }: BonDetailHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-start gap-2 sm:gap-3">
      <button
        type="button"
        onClick={() => navigate('/bons')}
        className="touch-target -ml-2 flex shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:text-muted-foreground sm:ml-0"
        aria-label="Retour à la liste des bons"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="whitespace-nowrap font-mono text-xl font-bold text-foreground">{bon.reference}</h1>
          <BonStateBadges
            status={bon.status}
            subStatus={bon.subStatus}
            lateness={bon.lateness}
            awaitingSignature={!!bon.pendingSignature}
          />
        </div>
        <p className="text-xs text-muted-foreground/70">
          Créé le {formatDateLong(bon.createdAt)} par {bon.createdBy.displayName}
        </p>
        {bon.replaces && (
          <p className="text-xs text-muted-foreground">
            Remplace le bon{' '}
            <Link className="font-mono text-primary hover:underline" to={`/bons/${bon.replaces.id}`}>{bon.replaces.reference}</Link>
          </p>
        )}
        {bon.replacedBy && (
          <p className="text-xs text-muted-foreground">
            {bon.status === 'archived' ? 'Clôturé — remplacé par le bon ' : 'Sera remplacé par le bon '}
            <Link className="font-mono text-primary hover:underline" to={`/bons/${bon.replacedBy.id}`}>{bon.replacedBy.reference}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
