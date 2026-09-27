/** Formes vérifiées des contrats de src/contracts/kpi.ts. */
import type {
  KpiClosureReason,
  KpiCompared,
  KpiCreationToSend,
  KpiCreationToSendMetrics,
  KpiDelaisResponse,
  KpiDelaisVolumeSeriesPoint,
  KpiIncidentsContestations,
  KpiIncidentsResponse,
  KpiLoanDuration,
  KpiParcLoaned,
  KpiParcNotReturned,
  KpiParcResponse,
  KpiParcReturnOverdue,
  KpiParcReturnOverdueItem,
  KpiParcTopModel,
  KpiPeriodInfo,
  KpiPreviousInfo,
  KpiRatioCompared,
  KpiReminderRankStat,
  KpiSendToSignatureMetrics,
  KpiSendToSignatureStep,
  KpiSeriesPoint,
  KpiStatusBreakdownItem,
  KpiWaiting,
  KpiWaitingStep,
  KpiTodayFilialeCount,
  KpiTodayResponse,
  KpiTodayRow,
  KpiTodaySection,
} from '../../../src/contracts/kpi';
import { bonStatus, equipmentCategory } from '../support/common-shapes';
import { arrayOf, int, isoDate, literal, nullable, num, object, Shape, str, uuid } from '../support/shape';
import { parcCategoryCount, parcFilialeCount, parcSituationCount } from './reporting';

/** Date civile « AAAA-MM-JJ », distincte des dates-heures ISO des autres routes. */
const kpiDate: Shape<string> = {
  label: 'une date AAAA-MM-JJ',
  check: (value, path) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? [] : [`${path} : date AAAA-MM-JJ attendue`],
};

const compared = object<KpiCompared>({ current: num, previous: num });
const ratioCompared = object<KpiRatioCompared>({ current: nullable(num), previous: nullable(num) });
const seriesPoint = object<KpiSeriesPoint>({ bucket: kpiDate, count: int });

const envelopeFields = {
  asOf: isoDate,
  period: object<KpiPeriodInfo>({ from: kpiDate, to: kpiDate, granularity: literal('day', 'week', 'month'), days: int }),
  previous: object<KpiPreviousInfo>({ from: kpiDate, to: kpiDate }),
  filialeId: nullable(uuid),
};

const loaned = object<KpiParcLoaned>({
  total: int,
  bons: int,
  byCategory: arrayOf(parcCategoryCount, { minLength: 1 }),
  byFiliale: arrayOf(parcFilialeCount, { minLength: 1 }),
  bySituation: arrayOf(parcSituationCount, { minLength: 3 }),
  topModels: arrayOf(
    object<KpiParcTopModel>({ catalogItemId: uuid, label: str, category: equipmentCategory, count: int }),
    { minLength: 1 },
  ),
  offCatalogShare: nullable(num),
  serialCoverage: nullable(num),
  series: arrayOf(seriesPoint, { minLength: 1 }),
});

const returnOverdue = object<KpiParcReturnOverdue>({
  bons: int,
  equipments: int,
  avgDays: nullable(num),
  medianDays: nullable(num),
  top: arrayOf(
    object<KpiParcReturnOverdueItem>({
      bonId: uuid,
      reference: str,
      filiale: str,
      collaborateur: str,
      dateRestitution: kpiDate,
      daysLate: int,
      equipments: int,
    }),
    { minLength: 1 },
  ),
});

export const kpiParc = object<KpiParcResponse>({
  ...envelopeFields,
  loaned,
  returnOverdue,
  notReturned: object<KpiParcNotReturned>({
    declared: compared,
    found: compared,
    closedBonsShare: ratioCompared,
    openNow: int,
  }),
});

const creationToSendMetrics = { medianHours: nullable(num), p90Hours: nullable(num) };
const sendToSignatureMetrics = {
  medianHours: nullable(num),
  p90Hours: nullable(num),
  within48h: nullable(num),
  within7d: nullable(num),
};
const sendToSignatureStep = object<KpiSendToSignatureStep>({
  ...sendToSignatureMetrics,
  count: int,
  previous: object<KpiSendToSignatureMetrics>(sendToSignatureMetrics),
});

export const kpiDelais = object<KpiDelaisResponse>({
  ...envelopeFields,
  volumes: object<KpiDelaisResponse['volumes']>({
    created: compared,
    sent: compared,
    archived: compared,
    cancelled: compared,
    series: arrayOf(
      object<KpiDelaisVolumeSeriesPoint>({ bucket: kpiDate, created: int, sent: int, archived: int }),
      { minLength: 1 },
    ),
  }),
  statusBreakdown: arrayOf(object<KpiStatusBreakdownItem>({ status: bonStatus, label: str, count: int }), { minLength: 8 }),
  creationToSend: object<KpiCreationToSend>({
    ...creationToSendMetrics,
    count: int,
    previous: object<KpiCreationToSendMetrics>(creationToSendMetrics),
  }),
  sendToSignature: object<KpiDelaisResponse['sendToSignature']>({
    mise_disposition: sendToSignatureStep,
    restitution: sendToSignatureStep,
    pv_cloture: sendToSignatureStep,
  }),
  signatureMode: object<KpiDelaisResponse['signatureMode']>({ inPerson: compared, remote: compared, proxy: compared }),
  loanDuration: object<KpiLoanDuration>({ count: int, avgDays: ratioCompared, medianDays: ratioCompared }),
  waiting: object<KpiWaiting>({
    thresholdDays: int,
    overdueTotal: int,
    steps: arrayOf(
      object<KpiWaitingStep>({
        step: literal('mise_disposition', 'restitution', 'pv_cloture'),
        label: str,
        count: int,
        avgAgeDays: nullable(num),
        overdue: int,
      }),
      { minLength: 3 },
    ),
  }),
});

const closureReason = object<KpiClosureReason>({ reason: str, count: int });

export const kpiIncidents = object<KpiIncidentsResponse>({
  ...envelopeFields,
  notReturned: object<KpiIncidentsResponse['notReturned']>({ declared: compared, found: compared, stillMissing: int }),
  pvCloture: object<KpiIncidentsResponse['pvCloture']>({ emitted: compared }),
  withoutSignature: object<KpiIncidentsResponse['withoutSignature']>({
    handovers: compared,
    closures: compared,
    handoverReasons: arrayOf(closureReason),
    closureReasons: arrayOf(closureReason),
  }),
  cancellations: object<KpiIncidentsResponse['cancellations']>({ count: compared }),
  contestations: object<KpiIncidentsContestations>({
    received: compared,
    toProcess: int,
    decided: compared,
    founded: compared,
    notRetained: compared,
    resolutionMedianDays: ratioCompared,
  }),
  reminders: object<KpiIncidentsResponse['reminders']>({
    byRank: arrayOf(
      object<KpiReminderRankStat>({ rank: int, sent: compared, signedAfter: compared, efficiency: nullable(num) }),
      { minLength: 3 },
    ),
    documentsWithThreeOrMore: compared,
  }),
  failedEmails: object<KpiIncidentsResponse['failedEmails']>({ count: compared }),
});

const todayRow = object<KpiTodayRow>({
  bonId: uuid,
  reference: str,
  collaborateurId: uuid,
  collaborateur: str,
  since: isoDate,
  detail: nullable(str),
});
const todaySection = object<KpiTodaySection>({ total: int, rows: arrayOf(todayRow) });

export const kpiToday = object<KpiTodayResponse>({
  asOf: isoDate,
  signatureOverdueDays: int,
  openBons: int,
  activeBons: int,
  restitutionInProgress: int,
  awaitingSignatures: int,
  overdueSignatures: int,
  overdueReturns: object<KpiTodayResponse['overdueReturns']>({ equipments: int, bons: int }),
  contestationsToProcess: int,
  expiredLinks: int,
  departures: object<KpiTodayResponse['departures']>({ collaborateurs: int, equipments: int }),
  openBonsByFiliale: arrayOf(object<KpiTodayFilialeCount>({ id: uuid, name: str, count: int }), { minLength: 1 }),
  toDo: object<KpiTodayResponse['toDo']>({
    drafts: todaySection,
    overdueSignatures: todaySection,
    expiredLinks: todaySection,
    overdueReturns: todaySection,
    contestations: todaySection,
    departures: todaySection,
    partialRestitutionsToSign: todaySection,
  }),
});
