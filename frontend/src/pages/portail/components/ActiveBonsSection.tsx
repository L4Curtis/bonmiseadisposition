import { CheckCircle2, AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateLong } from '@/lib/dates';
import type { BonCollab } from '../types';

interface ActiveBonsSectionProps {
  bons: BonCollab[];
  onOpen: (bon: BonCollab) => void;
  onContest: (bon: BonCollab) => void;
}

export function ActiveBonsSection({ bons, onOpen, onContest }: ActiveBonsSectionProps) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-success uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> En cours ({bons.length})
      </h2>
      <div className="space-y-2">
        {bons.map((bon) => (
          <Card key={bon.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onOpen(bon)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-semibold text-foreground">{bon.reference}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{bon.filiale.displayName}</p>
                  <p className="text-xs text-muted-foreground">Depuis le {formatDateLong(bon.dateMiseDisposition)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={bon.status} signatures={bon.signatures} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onContest(bon); }}
                    className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    <AlertOctagon className="mr-1.5 h-3.5 w-3.5" /> Contester
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
