import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/StatCard';
import { Package, AlertTriangle, Clock, Building2 } from 'lucide-react';
import type { InventorySummary } from './types';

interface InventorySummaryCardsProps {
  summary: InventorySummary | null;
  summaryError: string | null;
  onRetry: () => void;
  /** Filtre la liste sur les retards de restitution (tuile cliquable). */
  onOverdueClick: () => void;
  overdueActive: boolean;
  /** Filtre la liste sur la situation « en attente de signature » (tuile cliquable). */
  onSignatureWaitingClick: () => void;
  signatureWaitingActive: boolean;
}

/** Tuiles de résumé du parc prêté : total, retards, catégories, filiales.
 *  « En retard de restitution » et « En attente de signature » filtrent la
 *  liste au clic (état persisté dans l'URL par useInventory).
 *  Affiche une erreur explicite avec « Réessayer » si le résumé échoue à charger. */
export function InventorySummaryCards({
  summary,
  summaryError,
  onRetry,
  onOverdueClick,
  overdueActive,
  onSignatureWaitingClick,
  signatureWaitingActive,
}: InventorySummaryCardsProps) {
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
            onClick={onOverdueClick}
            className={overdueActive ? 'ring-2 ring-destructive/50' : undefined}
          />
          <StatCard
            icon={Clock}
            label="En attente de signature"
            value={summary.bySituation.find((s) => s.situation === 'en_attente_signature')?.count ?? 0}
            hint="Matériel remis, bon non encore signé"
            onClick={onSignatureWaitingClick}
            className={signatureWaitingActive ? 'ring-2 ring-primary/50' : undefined}
          />
          <StatCard icon={Building2} label="Filiales" value={summary.byFiliale.length} />
        </>
      ) : (
        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)
      )}
    </div>
  );
}
