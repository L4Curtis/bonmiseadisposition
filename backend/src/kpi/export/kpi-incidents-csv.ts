import type { ClosureReason, KpiIncidentsResponse } from '../kpi-types';
import {
  decimal, flowRow, KpiCsvRow, KpiCsvScope, percent, periodRow, scopeOf, stateRow, unitFor,
} from './kpi-csv-format';

/** « 1er rappel », « 2e rappel » : mots de l'écran. */
function rankLabel(rank: number): string {
  return rank === 1 ? '1er rappel' : `${rank}e rappel`;
}

/**
 * Lignes de l'export de l'onglet « Incidents » : non-restitutions, PV,
 * remises et clôtures sans signature (et leurs motifs), annulations,
 * contestations, rappels et emails en échec, avec les libellés de l'écran.
 */
export function incidentsCsvRows(data: KpiIncidentsResponse): KpiCsvRow[] {
  const scope = scopeOf(data);
  return [
    ...notReturnedRows(data, scope),
    ...withoutSignatureRows(data, scope),
    flowRow('Annulations', 'Bons annulés', scope, data.cancellations.count, 'bons'),
    ...contestationRows(data, scope),
    ...reminderRows(data, scope),
    flowRow('Emails', 'Emails en échec', scope, data.failedEmails.count, 'emails'),
  ];
}

function notReturnedRows(data: KpiIncidentsResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const { notReturned } = data;
  return [
    stateRow('Non-restitutions', 'Encore non restitués', scope, decimal(notReturned.stillMissing),
      unitFor(notReturned.stillMissing, 'équipement', 'équipements')),
    flowRow('Non-restitutions', 'Équipements déclarés non restitués', scope, notReturned.declared, 'équipements'),
    flowRow('Non-restitutions', 'Équipements retrouvés', scope, notReturned.found, 'équipements'),
    flowRow('Non-restitutions', 'PV de non-restitution émis', scope, data.pvCloture.emitted, 'PV'),
  ];
}

function reasonRows(rubrique: string, reasons: readonly ClosureReason[], scope: KpiCsvScope): KpiCsvRow[] {
  return reasons.map((r) => periodRow(rubrique, r.reason, scope, decimal(r.count),
    unitFor(r.count, 'bon', 'bons')));
}

function withoutSignatureRows(data: KpiIncidentsResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const ws = data.withoutSignature;
  return [
    flowRow('Sans signature', 'Remises constatées sans signature', scope, ws.handovers, 'bons'),
    flowRow('Sans signature', 'Clôturés sans signature', scope, ws.closures, 'bons'),
    ...reasonRows('Motifs des remises constatées sans signature', ws.handoverReasons, scope),
    ...reasonRows('Motifs des clôtures sans signature', ws.closureReasons, scope),
  ];
}

function contestationRows(data: KpiIncidentsResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const c = data.contestations;
  return [
    stateRow('Contestations', 'Contestations à traiter', scope, decimal(c.toProcess),
      unitFor(c.toProcess, 'contestation', 'contestations')),
    flowRow('Contestations', 'Contestations reçues', scope, c.received, 'contestations'),
    flowRow('Contestations', 'Contestations tranchées', scope, c.decided, 'contestations'),
    flowRow('Contestations', 'Fondées', scope, c.founded, 'contestations'),
    flowRow('Contestations', 'Non retenues', scope, c.notRetained, 'contestations'),
    flowRow('Contestations', 'Délai de décision (médiane)', scope, c.resolutionMedianDays, 'jours'),
  ];
}

function reminderRows(data: KpiIncidentsResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const { reminders } = data;
  return [
    ...reminders.byRank.flatMap((r) => [
      flowRow('Rappels automatiques', `${rankLabel(r.rank)} : envoyés`, scope, r.sent, 'rappels'),
      flowRow('Rappels automatiques', `${rankLabel(r.rank)} : suivis de la signature`, scope, r.signedAfter, 'documents'),
      periodRow('Rappels automatiques', `${rankLabel(r.rank)} : documents signés après ce rappel`, scope,
        percent(r.efficiency), '%'),
    ]),
    flowRow('Rappels automatiques', 'Documents ayant reçu 3 rappels', scope, reminders.documentsWithThreeOrMore, 'documents'),
  ];
}
