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
