import type { KpiDelaisResponse, SendToSignature } from '../kpi-types';
import {
  bucketLabel, decimal, flowRow, KpiCsvRow, KpiCsvScope, percent, periodRow, scopeOf, stateRow, unitFor,
} from './kpi-csv-format';

/** Documents suivis par « Délai entre la demande et la signature », dans
 *  l'ordre de l'écran. */
const SIGNATURE_STEPS: ReadonlyArray<{ key: keyof SendToSignature; label: string }> = [
  { key: 'mise_disposition', label: 'Remise' },
  { key: 'restitution', label: 'Restitution' },
  { key: 'pv_cloture', label: 'PV de non-restitution' },
];

/**
 * Lignes de l'export de l'onglet « Délais » : volumes, délais de traitement,
 * mode de signature, durée de prêt, bons par statut et signatures attendues
 * (dont « Signature en retard »), avec les libellés de l'écran.
 */
export function delaisCsvRows(data: KpiDelaisResponse): KpiCsvRow[] {
  const scope = scopeOf(data);
  return [
    ...volumeRows(data, scope),
    ...delayRows(data, scope),
    ...signatureModeRows(data, scope),
    ...data.statusBreakdown.map((s) => stateRow('Bons par statut', s.label, scope, decimal(s.count), unitFor(s.count, 'bon', 'bons'))),
    ...waitingRows(data, scope),
    ...data.volumes.series.flatMap((point) => {
      // La portée de chaque point est son jour (sa semaine, son mois).
      const at = { ...scope, state: bucketLabel(point.bucket, data.period.granularity) };
      return [
        stateRow('Évolution des volumes', 'Bons créés', at, decimal(point.created), 'bons'),
        stateRow('Évolution des volumes', 'Bons envoyés', at, decimal(point.sent), 'bons'),
        stateRow('Évolution des volumes', 'Bons clôturés', at, decimal(point.archived), 'bons'),
      ];
    }),
  ];
}

function volumeRows(data: KpiDelaisResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const { volumes } = data;
  return [
    flowRow('Volumes', 'Bons créés', scope, volumes.created, 'bons'),
    flowRow('Volumes', 'Bons envoyés', scope, volumes.sent, 'bons'),
    flowRow('Volumes', 'Bons clôturés', scope, volumes.archived, 'bons'),
    flowRow('Volumes', 'Bons annulés', scope, volumes.cancelled, 'bons'),
  ];
}

function delayRows(data: KpiDelaisResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const toSend = data.creationToSend;
  const loan = data.loanDuration;
  return [
    periodRow('Délai entre création et envoi', 'Bons envoyés pour la première fois', scope,
      decimal(toSend.count), 'bons'),
    flowRow('Délai entre création et envoi', 'Médiane', scope,
      { current: toSend.medianHours, previous: toSend.previous.medianHours }, 'heures'),
    flowRow('Délai entre création et envoi', '9 bons sur 10 envoyés en moins de', scope,
      { current: toSend.p90Hours, previous: toSend.previous.p90Hours }, 'heures'),
    ...SIGNATURE_STEPS.flatMap(({ key, label }) => {
      const step = data.sendToSignature[key];
      const rubrique = `Délai entre la demande et la signature : ${label}`;
      return [
        periodRow(rubrique, 'Documents signés', scope, decimal(step.count), 'documents'),
        flowRow(rubrique, 'Médiane', scope, { current: step.medianHours, previous: step.previous.medianHours }, 'heures'),
        flowRow(rubrique, '9 documents sur 10 signés en moins de', scope,
          { current: step.p90Hours, previous: step.previous.p90Hours }, 'heures'),
        flowRow(rubrique, 'Signés sous 48 h', scope,
          { current: step.within48h, previous: step.previous.within48h }, '%', percent),
        flowRow(rubrique, 'Signés sous 7 jours', scope,
          { current: step.within7d, previous: step.previous.within7d }, '%', percent),
      ];
    }),
    periodRow('Durée de prêt', 'Bons clôturés', scope, decimal(loan.count), 'bons'),
    flowRow('Durée de prêt', 'Durée moyenne de prêt', scope, loan.avgDays, 'jours'),
    flowRow('Durée de prêt', 'Durée médiane de prêt', scope, loan.medianDays, 'jours'),
  ];
}

function signatureModeRows(data: KpiDelaisResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const mode = data.signatureMode;
  const rubrique = 'Comment les documents ont été signés';
  return [
    flowRow(rubrique, 'À distance, par le lien reçu', scope, mode.remote, 'signatures'),
    flowRow(rubrique, 'Sur place, devant le technicien', scope, mode.inPerson, 'signatures'),
    flowRow(rubrique, 'Par une personne mandatée', scope, mode.proxy, 'signatures'),
  ];
}

function waitingRows(data: KpiDelaisResponse, scope: KpiCsvScope): KpiCsvRow[] {
  const { waiting } = data;
  const rubrique = 'Signatures attendues par document';
  return [
    stateRow(rubrique, 'Signature en retard', scope, decimal(waiting.overdueSignatures),
      unitFor(waiting.overdueSignatures, 'bon', 'bons')),
    stateRow(rubrique, 'Seuil de « Signature en retard »', scope, decimal(waiting.thresholdDays), 'jours'),
    ...waiting.steps.flatMap((step) => [
      stateRow(rubrique, `${step.label} : en attente`, scope, decimal(step.count), unitFor(step.count, 'bon', 'bons')),
      stateRow(rubrique, `${step.label} : Signature en retard`, scope, decimal(step.overdueSignatures),
        unitFor(step.overdueSignatures, 'bon', 'bons')),
      stateRow(rubrique, `${step.label} : attente moyenne`, scope, decimal(step.avgAgeDays), 'jours'),
    ]),
  ];
}
