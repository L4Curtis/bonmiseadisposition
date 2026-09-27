import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Building2, Clock, Package } from 'lucide-react';
import { BON_STATUS_LABELS, LATENESS_LABELS } from '@/domain/labels';
import { KpiCard, KpiCardSkeleton } from '@/pages/dashboard/components/KpiCard';
import { UNITS } from '@/pages/dashboard/lib/kpi-scope';
import type { InventorySummary } from './types';

interface InventorySummaryCardsProps {
  summary: InventorySummary | null;
  summaryError: string | null;
  onRetry: () => void;
  /** Filtre la liste sur « Retour en retard ». */
  onOverdueClick: () => void;
  overdueActive: boolean;
  /** Filtre la liste sur la situation « Remise à signer ». */
  onSignatureWaitingClick: () => void;
  signatureWaitingActive: boolean;
}

/** Bouton-filtre autour d'une carte : un clic filtre la liste en dessous
 *  (état gardé dans l'adresse par useInventory). */
function FilterCard({ active, onClick, label, children }: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`rounded-lg text-left ${active ? 'ring-2 ring-primary/50' : ''}`}
    >
      {children}
    </button>
  );
}

/** Cartes du parc prêté, états du jour (non filtrés par les filtres de la
 *  liste) : total, « Retour en retard » et « Remise à signer » (cliquables,
 *  elles filtrent la liste), filiales concernées. */
export function InventorySummaryCards({
  summary,
  summaryError,
  onRetry,
  onOverdueClick,
  overdueActive,
  onSignatureWaitingClick,
  signatureWaitingActive,
}: InventorySummaryCardsProps) {
  if (summaryError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <span className="text-destructive">{summaryError}</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Réessayer</Button>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }
  const toSign = summary.bySituation.find((s) => s.situation === 'en_attente_signature')?.count ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard
        icon={Package} label="Équipements chez les collaborateurs" value={summary.total} unit={UNITS.equipments}
        detail="tous filtres confondus"
      />
      <FilterCard active={overdueActive} onClick={onOverdueClick} label={`Filtrer : ${LATENESS_LABELS.return}`}>
        <KpiCard
          icon={AlertTriangle} label={LATENESS_LABELS.return} value={summary.overdue} unit={UNITS.equipments}
          tone={summary.overdue > 0 ? 'danger' : 'default'} detail="date de restitution prévue dépassée"
        />
      </FilterCard>
      <FilterCard active={signatureWaitingActive} onClick={onSignatureWaitingClick} label={`Filtrer : ${BON_STATUS_LABELS.sent_mise_dispo}`}>
        <KpiCard
          icon={Clock} label={BON_STATUS_LABELS.sent_mise_dispo} value={toSign} unit={UNITS.equipments}
          detail="remis au collaborateur, remise pas encore signée"
        />
      </FilterCard>
      <KpiCard
        icon={Building2} label="Filiales concernées" value={summary.byFiliale.length}
        detail="ayant au moins un équipement prêté"
      />
    </div>
  );
}
