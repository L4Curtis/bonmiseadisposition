import { AlertOctagon, ChevronLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateLong } from '@/lib/utils';
import type { BonDetailData } from '../../detail/types';

interface BonHeaderCollabProps {
  bon: BonDetailData;
  canContest: boolean;
  pdfLoading: string | null;
  onBack: () => void;
  onContest: () => void;
  onDownloadPdf: () => void;
}

export function BonHeaderCollab({ bon, canContest, pdfLoading, onBack, onContest, onDownloadPdf }: BonHeaderCollabProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Retour à mes bons" onClick={onBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-mono">{bon.reference}</h1>
            <StatusBadge status={bon.status} signatures={bon.signatures} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Créé le {formatDateLong(bon.createdAt)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {canContest && (
          <Button
            variant="outline"
            size="sm"
            onClick={onContest}
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <AlertOctagon className="mr-1.5 h-3.5 w-3.5" /> Contester
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onDownloadPdf}
          disabled={!!pdfLoading}
        >
          {pdfLoading === 'mise_disposition' ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          PDF
        </Button>
      </div>
    </div>
  );
}
