import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateLong } from '@/lib/utils';
import type { BonDetailData } from './types';
import { BonActionButtons, type BonActionButtonsProps } from './BonActionButtons';

export interface BonDetailHeaderProps extends BonActionButtonsProps {
  readonly bon: BonDetailData;
  readonly bonId: string;
  readonly isActive: boolean;
  readonly isPartiallyReturned: boolean;
}

export function BonDetailHeader(props: BonDetailHeaderProps) {
  const { bon, isActive, isPartiallyReturned } = props;
  const navigate = useNavigate();

  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/bons')} className="text-muted-foreground/70 hover:text-muted-foreground" aria-label="Retour à la liste des bons">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-mono text-foreground">{bon.reference}</h1>
            <StatusBadge status={bon.status} signatures={bon.signatures} />
          </div>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Créé le {formatDateLong(bon.createdAt)} par {bon.createdBy.displayName}
          </p>
        </div>
      </div>

      <BonActionButtons
        {...props}
        canInitiateRestitution={isActive || isPartiallyReturned}
      />
    </div>
  );
}
