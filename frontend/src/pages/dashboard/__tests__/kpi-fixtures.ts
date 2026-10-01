/** Réponses d'API de référence pour les tests du tableau de bord : même forme
 *  que les contrats (src/contracts/kpi.ts), valeurs choisies pour distinguer
 *  unités et portées. */
import type { KpiTodayResponse, KpiTodaySection } from '@/contracts/kpi';
import type { ParcKpiResponse } from '../types/parc';
import type { DelaisKpiResponse } from '../types/delais';
import type { IncidentsKpiResponse } from '../types/incidents';

const ENVELOPE = {
  asOf: '2026-09-25T10:00:00.000Z',
  period: { from: '2026-08-27', to: '2026-09-25', granularity: 'day' as const, days: 30 },
  previous: { from: '2026-07-28', to: '2026-08-26' },
  filialeId: null,
};

const EMPTY_SECTION: KpiTodaySection = { total: 0, rows: [] };

export function todayFixture(overrides: Partial<KpiTodayResponse> = {}): KpiTodayResponse {
  return {
    asOf: '2026-09-25T10:00:00.000Z',
    signatureOverdueDays: 10,
    openBons: 40,
    activeBons: 18,
    restitutionInProgress: 5,
    awaitingSignatures: 11,
    overdueSignatures: 3,
    overdueReturns: { equipments: 6, bons: 3 },
    contestationsToProcess: 2,
    expiredLinks: 1,
    departures: { collaborateurs: 1, equipments: 4 },
    openBonsByFiliale: [{ id: 'f1', name: 'Bâtir Nord', count: 40 }],
    toDo: {
      drafts: EMPTY_SECTION,
      overdueSignatures: {
        total: 3,
        rows: [{ bonId: 'b1', reference: 'BON-2026-0057', collaborateurId: 'u1', collaborateur: 'Clara Fontaine',
          since: '2026-09-10T08:00:00.000Z', detail: null }],
      },
      expiredLinks: EMPTY_SECTION,
      overdueReturns: EMPTY_SECTION,
      contestations: {
        total: 2,
        rows: [{ bonId: 'b2', reference: 'BON-2026-0021', collaborateurId: 'u2', collaborateur: 'Léa Martin',
          since: '2026-09-16T08:00:00.000Z', detail: "En cours d'examen" }],
      },
      departures: EMPTY_SECTION,
      partialRestitutionsToSign: EMPTY_SECTION,
    },
    ...overrides,
  };
}

const compared = (current: number, previous: number) => ({ current, previous });

export function parcFixture(): ParcKpiResponse {
  return {
    ...ENVELOPE,
    loaned: {
      total: 61, bons: 28,
      byCategory: [{ category: 'pc_portable', label: 'PC portable', count: 20 }],
      byFiliale: [{ filialeId: 'f1', name: 'Bâtir Nord', count: 29 }],
      topModels: [{ catalogItemId: 'c1', label: 'Dell 5450', category: 'pc_portable', count: 12 }],
      offCatalogShare: 0, serialCoverage: 0.9,
      series: [{ bucket: '2026-09-24', count: 60 }, { bucket: '2026-09-25', count: 61 }],
    },
    returnOverdue: {
      bons: 3, equipments: 6, avgDays: 10.3, medianDays: 7,
      top: [{ bonId: 'b9', reference: 'BON-2026-0045', filiale: 'Bâtir Nord', collaborateur: 'Hugo Petit',
        dateRestitution: '2026-09-06', daysLate: 19, equipments: 1 }],
    },
    notReturned: { declared: compared(3, 1), found: compared(1, 0), closedBonsShare: compared(0.1, 0), openNow: 2 },
  };
}

const metric = (count: number, median: number | null) => ({
  count, medianHours: median, p90Hours: median === null ? null : median * 2,
  within48h: count ? 6 / 7 : null, within7d: count ? 1 : null,
  previous: { medianHours: null, p90Hours: null, within48h: null, within7d: null },
});

export function delaisFixture(): DelaisKpiResponse {
  return {
    ...ENVELOPE,
    volumes: { created: compared(12, 10), sent: compared(9, 9), archived: compared(5, 4), cancelled: compared(1, 2), series: [] },
    statusBreakdown: [{ status: 'active', label: 'En cours', count: 18 }],
    creationToSend: { count: 9, medianHours: 2, p90Hours: 20, previous: { medianHours: 3, p90Hours: 25 } },
    sendToSignature: { mise_disposition: metric(7, 5), restitution: metric(3, 24), pv_cloture: metric(1, 0.2) },
    signatureMode: { inPerson: compared(2, 1), remote: compared(9, 8), proxy: compared(1, 0) },
    loanDuration: { count: 5, avgDays: compared(40, 35), medianDays: compared(38, 30) },
    waiting: {
      thresholdDays: 10, overdueSignatures: 3,
      steps: [
        { step: 'mise_disposition', label: 'Remise à signer', count: 5, avgAgeDays: 4, overdueSignatures: 2 },
        { step: 'restitution', label: 'Restitution à signer', count: 3, avgAgeDays: 12, overdueSignatures: 1 },
        { step: 'pv_cloture', label: 'PV de non-restitution à signer', count: 0, avgAgeDays: null, overdueSignatures: 0 },
      ],
    },
  };
}

export function incidentsFixture(): IncidentsKpiResponse {
  return {
    ...ENVELOPE,
    notReturned: { declared: compared(3, 1), found: compared(1, 0), stillMissing: 2 },
    pvCloture: { emitted: compared(2, 1) },
    withoutSignature: {
      handovers: compared(1, 0), closures: compared(1, 0),
      handoverReasons: [{ reason: 'Tablette en panne', count: 1 }],
      closureReasons: [{ reason: 'Parti avant de signer', count: 1 }],
    },
    cancellations: { count: compared(1, 0) },
    contestations: {
      received: compared(3, 1), toProcess: 1, decided: compared(2, 0),
      founded: compared(1, 0), notRetained: compared(1, 0), resolutionMedianDays: compared(2, 0),
    },
    reminders: {
      byRank: [
        { rank: 1, sent: compared(4, 2), signedAfter: compared(2, 1), efficiency: 0.5 },
        { rank: 2, sent: compared(0, 0), signedAfter: compared(0, 0), efficiency: null },
        { rank: 3, sent: compared(0, 0), signedAfter: compared(0, 0), efficiency: null },
      ],
      documentsWithThreeOrMore: compared(0, 0),
    },
    failedEmails: { count: compared(2, 0) },
  };
}
