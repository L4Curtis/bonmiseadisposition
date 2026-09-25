import { formatDateLong, formatTime } from '@/lib/dates';
import type { RetentionSimulation } from './retention-api';

interface RetentionSimulationSummaryProps {
  simulation: RetentionSimulation;
  /** La durée des pièces jointes dépasse celle de l'anonymisation : les
   *  pièces jointes des bons anonymisés s'ajoutent au décompte affiché. */
  attachmentsUndercounted?: boolean;
}

function Figure({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </dd>
    </div>
  );
}

/** Résultat d'une simulation de rétention : ce qui serait touché, par donnée. */
export function RetentionSimulationSummary({ simulation, attachmentsUndercounted = false }: RetentionSimulationSummaryProps) {
  const simulatedAt = formatTime(simulation.simulatedAt);
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-xs text-muted-foreground">
        Simulation de {simulatedAt} — rien n'a été modifié.
      </p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure
          value={String(simulation.bons)}
          label="Bons anonymisés"
          detail={`Clôturés ou annulés, sans modification depuis le ${formatDateLong(simulation.anonymizeCutoff)}.`}
        />
        <Figure
          value={`${attachmentsUndercounted ? 'au moins ' : ''}${simulation.attachments}`}
          label="Pièces jointes supprimées"
          detail={attachmentsUndercounted
            ? 'Plus celles des bons anonymisés, détruites avec eux.'
            : 'Y compris celles des bons anonymisés.'}
        />
        <Figure
          value={String(simulation.auditLogs)}
          label="Lignes d'audit supprimées"
          detail={`Sur ${simulation.auditLogsTotal} ligne(s) au journal (purge hebdomadaire).`}
        />
      </dl>
      <p className="text-xs text-muted-foreground">
        S'y ajoutent {simulation.expiredTokens} lien(s) de signature expiré(s) jamais signé(s).
      </p>
    </div>
  );
}
