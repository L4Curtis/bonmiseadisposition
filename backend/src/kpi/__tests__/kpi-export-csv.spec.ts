import { buildCsv } from '../../common/csv';
import { delaisCsvFile, incidentsCsvFile, parcCsvFile } from '../export/kpi-export';
import type { KpiDelaisResponse, KpiEnvelope, KpiIncidentsResponse, KpiParcResponse } from '../kpi-types';

/**
 * « Exporter ces indicateurs » (R-102) : un fichier par onglet, lisible tel
 * quel dans Excel. Règles des exports (R-100, R-101) : libellés d'écran,
 * jamais de code technique ni de valeur négative ni d'apostrophe ajoutée ;
 * dates JJ/MM/AAAA, heure de Paris.
 */

const envelope: KpiEnvelope = {
  // 22 h 30 UTC le 30/09 = 00 h 30 le 01/10 à Paris.
  asOf: '2026-09-30T22:30:00.000Z',
  period: { from: '2026-09-01', to: '2026-09-30', granularity: 'week', days: 30 },
  previous: { from: '2026-08-02', to: '2026-08-31' },
  filialeId: null,
};

const compared = (current: number, previous: number | null = 0) => ({ current, previous });

const parc: KpiParcResponse = {
  ...envelope,
  loaned: {
    total: 12,
    bons: 5,
    byCategory: [{ category: 'pc_portable', label: 'PC portable', count: 12 }],
    byFiliale: [{ filialeId: 'f1', name: 'Paris', count: 12 }],
    bySituation: [
      { situation: 'en_attente_signature', label: 'Remise à signer', count: 2 },
      { situation: 'en_circulation', label: 'En cours', count: 10 },
      { situation: 'en_litige', label: 'Contesté', count: 0 },
    ],
    topModels: [{ catalogItemId: 'c1', label: 'Dell Latitude', category: 'pc_portable', count: 7 }],
    offCatalogShare: 0.125,
    serialCoverage: 0.875,
    series: [{ bucket: '2026-09-07', count: 11 }],
  },
  returnOverdue: {
    bons: 1, equipments: 2, avgDays: 3.5, medianDays: 3.5,
    top: [{ bonId: 'b1', reference: 'BON-2026-0001', filiale: 'Paris', collaborateur: 'Jean Dupont', dateRestitution: '2026-09-20', daysLate: 11, equipments: 2 }],
  },
  notReturned: { declared: compared(1, 2), found: compared(0, 1), closedBonsShare: { current: 0.5, previous: null }, openNow: 3 },
};

const signatureStep = (count: number) => ({
  count, medianHours: 1.5, p90Hours: 30, within48h: 0.8, within7d: 1,
  previous: { medianHours: 2, p90Hours: null, within48h: null, within7d: null },
});

const delais: KpiDelaisResponse = {
  ...envelope,
  volumes: { created: compared(4, 3), sent: compared(3), archived: compared(2), cancelled: compared(1), series: [{ bucket: '2026-09-07', created: 4, sent: 3, archived: 2 }] },
  statusBreakdown: [{ status: 'sent_mise_dispo', label: 'Remise à signer', count: 2 }],
  creationToSend: { count: 3, medianHours: 1.5, p90Hours: 4, previous: { medianHours: null, p90Hours: null } },
  sendToSignature: { mise_disposition: signatureStep(3), restitution: signatureStep(1), pv_cloture: signatureStep(0) },
  signatureMode: { inPerson: compared(1), remote: compared(2), proxy: compared(0) },
  loanDuration: { count: 2, avgDays: { current: 40.25, previous: null }, medianDays: { current: 40, previous: null } },
  waiting: {
    thresholdDays: 7,
    overdueSignatures: 3,
    overdueTotal: 3,
    steps: [{ step: 'mise_disposition', label: 'Remise à signer', count: 5, avgAgeDays: 4, overdueSignatures: 3, overdue: 3 }],
  },
};

const incidents: KpiIncidentsResponse = {
  ...envelope,
  notReturned: { declared: compared(1), found: compared(0), stillMissing: 3 },
  pvCloture: { emitted: compared(1) },
  withoutSignature: {
    handovers: compared(1), closures: compared(0),
    handoverReasons: [{ reason: 'Collaborateur absent', count: 1 }], closureReasons: [],
  },
  cancellations: { count: compared(2) },
  contestations: {
    received: compared(2), toProcess: 1, decided: compared(1), founded: compared(1), notRetained: compared(0),
    resolutionMedianDays: { current: 2, previous: null },
  },
  reminders: {
    byRank: [{ rank: 1, sent: compared(4), signedAfter: compared(2), efficiency: 0.5 }],
    documentsWithThreeOrMore: compared(0),
  },
  failedEmails: { count: compared(0) },
};

/** Cellules du fichier assemblé, ligne par ligne (sans BOM ni guillemets). */
function cells(csv: string): string[][] {
  return csv.slice(1).split('\n').map((line) => line.slice(1, -1).split('";"'));
}

function rowOf(table: string[][], rubrique: string, indicateur: string): string[] | undefined {
  return table.find((r) => r[0] === rubrique && r[1] === indicateur);
}

const RAW_CODES = ['en_attente_signature', 'en_circulation', 'pc_portable', 'sent_mise_dispo', 'mise_disposition', 'pv_cloture'];

describe.each([
  ['Parc', 'parc', () => parcCsvFile(parc, null)],
  ['Délais', 'delais', () => delaisCsvFile(delais, 'Paris')],
  ['Incidents', 'incidents', () => incidentsCsvFile(incidents, null)],
] as const)('Export de l’onglet %s', (label, tab, build) => {
  const file = build();
  const csv = buildCsv(file.table);
  const table = cells(csv);

  it('fichier nommé par l’onglet et la période', () => {
    expect(file.filename).toBe(`indicateurs-${tab}-2026-09-01-au-2026-09-30`);
  });

  it('colonnes lisibles et contexte en tête : onglet, périodes, filiale, heure du calcul (Paris)', () => {
    expect(table[0]).toEqual(['Rubrique', 'Indicateur', 'Portée', 'Valeur', 'Période précédente', 'Unité']);
    expect(rowOf(table, 'Contexte', 'Onglet du tableau de bord')?.[3]).toBe(label);
    expect(rowOf(table, 'Contexte', 'Période')?.[3]).toBe('du 01/09/2026 au 30/09/2026');
    expect(rowOf(table, 'Contexte', 'Période précédente (comparaison)')?.[3]).toBe('du 02/08/2026 au 31/08/2026');
    expect(rowOf(table, 'Contexte', 'Calculé le')?.[3]).toBe('01/10/2026 00:30');
  });

  it('aucun code technique, aucune valeur négative, aucune apostrophe ajoutée', () => {
    for (const code of RAW_CODES) expect(csv).not.toContain(code);
    for (const row of table) {
      for (const cell of row) {
        expect(cell.startsWith("'")).toBe(false);
        expect(cell.startsWith('-')).toBe(false);
      }
    }
  });
});

describe('Contenu des exports', () => {
  it('Parc : cartes, parts en pourcentage à la française, états du jour datés', () => {
    const table = cells(buildCsv(parcCsvFile(parc, null).table));
    expect(rowOf(table, 'Contexte', 'Filiale')?.[3]).toBe('Toutes les filiales');
    expect(rowOf(table, 'Parc prêté', 'Équipements chez les collaborateurs')).toEqual(
      ['Parc prêté', 'Équipements chez les collaborateurs', 'au 01/10/2026', '12', '', 'équipements'],
    );
    expect(rowOf(table, 'Qualité des données', 'Avec numéro de série')?.slice(3)).toEqual(['87,5', '', '%']);
    expect(rowOf(table, 'Par situation', 'Remise à signer')?.[3]).toBe('2');
    expect(rowOf(table, 'Retour en retard', 'Retard moyen par bon')?.[3]).toBe('3,5');
    expect(rowOf(table, 'Non-restitutions', 'Équipements déclarés non restitués')).toEqual(
      ['Non-restitutions', 'Équipements déclarés non restitués', 'du 01/09/2026 au 30/09/2026', '1', '2', 'équipements'],
    );
    expect(rowOf(table, 'Évolution du parc', 'Équipements chez les collaborateurs en fin de journée')?.[2])
      .toBe('semaine du 07/09/2026');
  });

  it('Délais : « Signature en retard » sous son nom, délais en heures décimales', () => {
    const table = cells(buildCsv(delaisCsvFile(delais, 'Paris').table));
    expect(rowOf(table, 'Contexte', 'Filiale')?.[3]).toBe('Paris');
    expect(rowOf(table, 'Signatures attendues par document', 'Signature en retard')?.slice(2)).toEqual(['au 01/10/2026', '3', '', 'bons']);
    expect(rowOf(table, 'Délai entre création et envoi', 'Médiane')?.slice(3)).toEqual(['1,5', '', 'heures']);
    expect(rowOf(table, 'Volumes', 'Bons créés')?.slice(3)).toEqual(['4', '3', 'bons']);
  });

  it('Incidents : états du jour et flux, motifs en clair', () => {
    const table = cells(buildCsv(incidentsCsvFile(incidents, null).table));
    expect(rowOf(table, 'Contestations', 'Contestations à traiter')?.slice(2)).toEqual(['au 01/10/2026', '1', '', 'contestation']);
    expect(rowOf(table, 'Motifs des remises constatées sans signature', 'Collaborateur absent')?.[3]).toBe('1');
    expect(rowOf(table, 'Rappels automatiques', '1er rappel : documents signés après ce rappel')?.[3]).toBe('50');
  });
});
