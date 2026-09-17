import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/StatCard';
import { Package, AlertTriangle, Layers, Building2 } from 'lucide-react';
import type { InventorySummary } from './types';

interface InventorySummaryCardsProps {
  summary: InventorySummary | null;
  summaryError: string | null;
  onRetry: () => void;
}

/** Tuiles de résumé du parc prêté : total, retards, catégories, filiales.
 *  Affiche une erreur explicite avec « Réessayer » si le résumé échoue à charger. */
export function InventorySummaryCards({ summary, summaryError, onRetry }: InventorySummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {summaryError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center justify-between gap-3">
          <span className="text-destructive">{summaryError}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      ) : summary ? (
        <>
          <StatCard icon={Package} label="Équipements prêtés" value={summary.total} />
          <StatCard
            icon={AlertTriangle}
            label="En retard de restitution"
            value={summary.overdue}
            tone={summary.overdue > 0 ? 'danger' : 'default'}
          />
          <StatCard icon={Layers} label="Catégories" value={summary.byCategory.length} />
          <StatCard icon={Building2} label="Filiales" value={summary.byFiliale.length} />
        </>
      ) : (
        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)
      )}
    </div>
  );
}
