import { useHostTimeZone } from '../../../common/__tests__/helpers/host-time-zone';
import { sliceExportRows, buildExportCsv, EXPORT_ROW_LIMIT, ExportBonRow } from '../bon-csv';

function makeRow(overrides: Partial<ExportBonRow> = {}): ExportBonRow {
  return {
    reference: 'BON-2026-0001',
    status: 'active',
    dateMiseDisposition: new Date('2026-04-01'),
    dateRestitution: null,
    createdAt: new Date('2026-03-28'),
    filiale: { displayName: 'Filiale Demo' },
    collaborateur: { displayName: 'Jean Dupont', email: 'jean.dupont@example.com', department: 'IT' },
    createdBy: { displayName: 'Tech IT' },
    equipments: [{ catalogItem: { brand: 'Lenovo', model: 'ThinkBook' }, customLabel: null }],
    signatures: [],
    ...overrides,
  };
}

describe('sliceExportRows', () => {
  it('does not truncate when under the limit', () => {
    const rows = [makeRow(), makeRow()];
    const result = sliceExportRows(rows, 5000);
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it('truncates to the limit and reports truncated:true when exceeded', () => {
    const rows = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, () => makeRow());
    const result = sliceExportRows(rows, EXPORT_ROW_LIMIT);
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(EXPORT_ROW_LIMIT);
  });
});

describe('buildExportCsv', () => {
  it('builds a BOM-prefixed CSV with header + one row per bon', () => {
    const csv = buildExportCsv([makeRow()]);

    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\n');
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[0]).toContain('Référence');
    expect(lines[1]).toContain('BON-2026-0001');
    expect(lines[1]).toContain('Lenovo ThinkBook');
  });

  it('falls back to customLabel when no catalog item, and blanks null department/dates', () => {
    const row = makeRow({
      collaborateur: { displayName: 'Jean Dupont', email: 'jean.dupont@example.com', department: null },
      dateMiseDisposition: null,
      equipments: [{ catalogItem: null, customLabel: 'Souris sans fil' }],
      signatures: [{ type: 'mise_disposition', signedAt: new Date('2026-04-02') }],
    });

    const csv = buildExportCsv([row]);
    const dataLine = csv.split('\n')[1];

    expect(dataLine).toContain('Souris sans fil');
    // Two consecutive empty quoted cells: department ('') then dateMiseDisposition ('')
    expect(dataLine).toContain('"";""');
  });

  it('escapes a leading formula character to neutralize CSV injection', () => {
    const row = makeRow({ collaborateur: { displayName: '=cmd|/c calc', email: 'x@example.com', department: null } });
    const csv = buildExportCsv([row]);
    expect(csv).toContain("'=cmd|/c calc");
  });

  it('shows "—" instead of an empty/null cell when the collaborator has no email (manual account)', () => {
    const row = makeRow({
      collaborateur: { displayName: 'Jean DUPONT', email: null, department: null },
    });

    const csv = buildExportCsv([row]);
    const dataLine = csv.split('\n')[1];

    expect(dataLine).toContain('"—"');
    expect(dataLine).not.toContain('"null"');
    expect(dataLine).not.toContain('"undefined"');
  });
});

/** Cellules de la première ligne de données, indexées par nom de colonne. */
function firstRowCells(csv: string): Record<string, string> {
  const [header, data] = csv.slice(1).split('\n');
  const unquote = (cell: string) => cell.slice(1, -1);
  const names = header.split(';').map(unquote);
  const values = data.split(';').map(unquote);
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}

describe('buildExportCsv — en-têtes en toutes lettres', () => {
  it('nomme chaque colonne sans abréviation', () => {
    const header = buildExportCsv([]).slice(1).split('\n')[0].split(';').map((c) => c.slice(1, -1));

    expect(header).toEqual([
      'Référence', 'Statut', 'Filiale', 'Collaborateur', 'Email du collaborateur',
      'Service', 'Date de mise à disposition', 'Date de restitution prévue', 'Nombre d’équipements',
      'Équipements', 'Créé par', 'Date de création',
      'Date de signature de la remise', 'Date de signature de la restitution',
    ]);
  });
});

describe('buildExportCsv — horodatages à l’heure de Paris, serveur réglé en UTC', () => {
  useHostTimeZone('UTC');

  it.each([
    ['été, juste avant minuit UTC', '2026-07-14T22:30:00.000Z', '15/07/2026 00:30'],
    ['été, 1 h 59 à Paris', '2026-07-14T23:59:00.000Z', '15/07/2026 01:59'],
    ['hiver, juste avant minuit UTC', '2026-01-14T23:30:00.000Z', '15/01/2026 00:30'],
    ['veille du passage à l’heure d’été (UTC+1)', '2026-03-29T00:30:00.000Z', '29/03/2026 01:30'],
    ['lendemain du passage à l’heure d’été (UTC+2)', '2026-03-29T01:30:00.000Z', '29/03/2026 03:30'],
    ['avant le retour à l’heure d’hiver (UTC+2)', '2026-10-25T00:30:00.000Z', '25/10/2026 02:30'],
    ['après le retour à l’heure d’hiver (UTC+1)', '2026-10-25T01:30:00.000Z', '25/10/2026 02:30'],
  ])('création et signatures en JJ/MM/AAAA HH:MM (%s)', (_cas, instant, expected) => {
    const row = makeRow({
      createdAt: new Date(instant),
      signatures: [
        { type: 'mise_disposition', signedAt: new Date(instant) },
        { type: 'restitution', signedAt: instant },
      ],
    });

    const cells = firstRowCells(buildExportCsv([row]));

    expect(cells['Date de création']).toBe(expected);
    expect(cells['Date de signature de la remise']).toBe(expected);
    expect(cells['Date de signature de la restitution']).toBe(expected);
  });

  it('les dates civiles (mise à disposition, restitution prévue) restent sans heure', () => {
    const row = makeRow({ dateMiseDisposition: new Date('2026-04-01'), dateRestitution: '2026-10-31' });

    const cells = firstRowCells(buildExportCsv([row]));

    expect(cells['Date de mise à disposition']).toBe('01/04/2026');
    expect(cells['Date de restitution prévue']).toBe('31/10/2026');
  });

  it('laisse vide une signature absente', () => {
    const cells = firstRowCells(buildExportCsv([makeRow({ signatures: [] })]));

    expect(cells['Date de signature de la remise']).toBe('');
    expect(cells['Date de signature de la restitution']).toBe('');
  });
});

describe('buildExportCsv — libellés de statut', () => {
  it.each([
    ['active', 'En cours'],
    ['archived', 'Clôturé'],
    ['sent_mise_dispo', 'Remise à signer'],
    ['partially_returned', 'Restitution en cours'],
  ] as const)('%s → « %s »', (status, label) => {
    expect(firstRowCells(buildExportCsv([makeRow({ status })])).Statut).toBe(label);
  });
});
