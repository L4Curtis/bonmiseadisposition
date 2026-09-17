import { AlertOctagon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import type { BonCollab } from '../types';

interface ContestedBonsSectionProps {
  bons: BonCollab[];
  onOpen: (bon: BonCollab) => void;
}

export function ContestedBonsSection({ bons, onOpen }: ContestedBonsSectionProps) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <AlertOctagon className="h-3.5 w-3.5" /> En contestation ({bons.length})
      </h2>
      <div className="space-y-2">
        {bons.map((bon) => (
          <Card key={bon.id} className="border-destructive/20 bg-destructive/5 cursor-pointer hover:border-destructive/40 transition-colors" onClick={() => onOpen(bon)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-sm font-semibold text-foreground">{bon.reference}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{bon.filiale.displayName}</p>
                </div>
                <StatusBadge status={bon.status} signatures={bon.signatures} />
              </div>
              <p className="text-xs text-destructive mt-2">Contestation en cours d'examen par le service IT.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
