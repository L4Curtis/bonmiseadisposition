import { buildFilialesExportCsv, buildFilialesImportTemplateCsv, FilialeExportRow, FILIALES_CSV_HEADERS } from '../filiales-csv';
import type { Mock } from 'vitest';
import * as fsModule from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Reçoit la doublure déclarée par vi.mock ci-dessus (remontée en tête de fichier).
const fs = fsModule as unknown as { existsSync: Mock; readFileSync: Mock };

function row(overrides: Partial<FilialeExportRow> = {}): FilialeExportRow {
  return {
    name: 'Livio Nord',
    displayName: 'Livio Nord',
    address: '1 rue de Lille',
    siret: '12345678900012',
    active: true,
    logoPath: null,
    stampPath: null,
    ...overrides,
  };
}

describe('buildFilialesExportCsv (GET /filiales/export)', () => {
  beforeEach(() => {
    fs.existsSync.mockReset();
    fs.readFileSync.mockReset();
  });

  it('is BOM-prefixed and starts with the exact header line', () => {
    const csv = buildFilialesExportCsv([], false);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const headerLine = csv.slice(1).split('\n')[0];
    expect(headerLine).toBe(FILIALES_CSV_HEADERS.map((h) => `"${h}"`).join(';'));
    expect(FILIALES_CSV_HEADERS.join(';')).toBe(
      'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64',
    );
  });

  it('renders active as oui/non', () => {
    const csv = buildFilialesExportCsv([row({ active: true }), row({ active: false, name: 'Livio Sud' })], false);
    const [, ...dataLines] = csv.slice(1).split('\n');

    expect(dataLines[0].split(';')[4]).toBe('"oui"');
    expect(dataLines[1].split(';')[4]).toBe('"non"');
  });

  it('escapes a cell starting with "=" to prevent formula injection', () => {
    const csv = buildFilialesExportCsv([row({ name: '=cmd|\' /C calc\'!A1' })], false);
    const dataLine = csv.slice(1).split('\n')[1];

    // escapeCsvCell prefixes a leading apostrophe before quoting
    expect(dataLine.split(';')[0]).toBe(`"'=cmd|' /C calc'!A1"`);
    expect(dataLine.split(';')[0]).not.toMatch(/^"=/);
  });

  it('leaves the image columns empty when images is not requested, even if files exist', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('fake-image-bytes'));

    const csv = buildFilialesExportCsv([row({ logoPath: 'uploads/logo.png', stampPath: 'uploads/stamp.png' })], false);
    const dataLine = csv.slice(1).split('\n')[1];
    const cells = dataLine.split(';');

    expect(cells[5]).toBe('""');
    expect(cells[6]).toBe('""');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('fills the image columns with raw base64 (no data URL prefix) when images=1', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('fake-image-bytes'));

    const csv = buildFilialesExportCsv([row({ logoPath: 'uploads/logo.png', stampPath: 'uploads/stamp.jpg' })], true);
    const dataLine = csv.slice(1).split('\n')[1];
    const cells = dataLine.split(';');
    const expectedB64 = Buffer.from('fake-image-bytes').toString('base64');

    expect(cells[5]).toBe(`"${expectedB64}"`);
    expect(cells[5]).not.toContain('data:');
    expect(cells[6]).toBe(`"${expectedB64}"`);
  });

  it('leaves an image column empty when images=1 but no file is stored', () => {
    const csv = buildFilialesExportCsv([row({ logoPath: null, stampPath: null })], true);
    const dataLine = csv.slice(1).split('\n')[1];
    const cells = dataLine.split(';');

    expect(cells[5]).toBe('""');
    expect(cells[6]).toBe('""');
  });

  it('leaves an image column empty when images=1 but the referenced file is missing on disk', () => {
    fs.existsSync.mockReturnValue(false);

    const csv = buildFilialesExportCsv([row({ logoPath: 'uploads/missing.png' })], true);
    const dataLine = csv.slice(1).split('\n')[1];

    expect(dataLine.split(';')[5]).toBe('""');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it.each(['../../etc/passwd', 'uploads/../../.env'])(
    'never reads a file outside data/, even if the stored path points there (%s)',
    (outside) => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(Buffer.from('secret'));

      const csv = buildFilialesExportCsv([row({ logoPath: outside })], true);
      const dataLine = csv.slice(1).split('\n')[1];

      expect(dataLine.split(';')[5]).toBe('""');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    },
  );
});

describe('buildFilialesImportTemplateCsv (GET /filiales/import/template)', () => {
  it('shares the exact same header as the export', () => {
    const template = buildFilialesImportTemplateCsv();
    const headerLine = template.slice(1).split('\n')[0];

    expect(headerLine).toBe(FILIALES_CSV_HEADERS.map((h) => `"${h}"`).join(';'));
  });

  it('is BOM-prefixed and provides exactly two explicitly-commented example rows', () => {
    const template = buildFilialesImportTemplateCsv();

    expect(template.charCodeAt(0)).toBe(0xfeff);
    const lines = template.slice(1).split('\n');
    expect(lines).toHaveLength(3); // header + 2 examples

    expect(lines[1]).toContain('#');
    expect(lines[2]).toContain('#');
  });

  it('includes one full example (address + siret) and one minimal example', () => {
    const template = buildFilialesImportTemplateCsv();
    const [, fullExample, minimalExample] = template.slice(1).split('\n');
    const fullCells = fullExample.split(';');
    const minimalCells = minimalExample.split(';');

    // colonnes: nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64
    expect(fullCells[2]).not.toBe('""'); // adresse renseignée
    expect(fullCells[3]).not.toBe('""'); // siret renseigné

    expect(minimalCells[2]).toBe('""'); // adresse vide
    expect(minimalCells[3]).toBe('""'); // siret vide
  });
});
