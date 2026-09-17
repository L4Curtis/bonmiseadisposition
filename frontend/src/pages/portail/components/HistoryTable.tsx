import { Archive, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateLong } from '@/lib/utils';
import type { BonCollab } from '../types';

interface HistoryTableProps {
  bons: BonCollab[];
  onOpen: (bon: BonCollab) => void;
}

export function HistoryTable({ bons, onOpen }: HistoryTableProps) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Archive className="h-3.5 w-3.5" /> Historique ({bons.length})
      </h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Historique des bons">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Référence</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Filiale</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {bons.map((bon) => (
                  <tr
                    key={bon.id}
                    className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                    onClick={() => onOpen(bon)}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold">{bon.reference}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{bon.filiale.displayName}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={bon.status} signatures={bon.signatures} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDateLong(bon.dateMiseDisposition)}</td>
                    <td className="px-4 py-2.5">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
