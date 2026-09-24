import { AUDIT_CSV_HEADERS, buildAuditExportCsv, exportableDetails } from '../audit-csv';

describe('exportableDetails', () => {
  it('retire les clés personnelles connues de la rétention et les secrets', () => {
    const out = exportableDetails({
      created: 2, email: 'a@b.fr', message: 'texte libre', reason: 'motif', resetToken: 'abc', passwordHash: 'x',
    });
    expect(JSON.parse(out)).toEqual({ created: 2 });
  });

  it('renvoie une chaîne vide quand il ne reste rien', () => {
    expect(exportableDetails(null)).toBe('');
    expect(exportableDetails({ email: 'a@b.fr' })).toBe('');
  });
});

describe('buildAuditExportCsv', () => {
  it('écrit une ligne par entrée, sans IP ni agent utilisateur, cellules échappées', () => {
    const csv = buildAuditExportCsv([
      {
        createdAt: new Date('2026-09-24T12:00:00.000Z'),
        action: 'bon_created',
        userEmail: null,
        details: { reference: 'BON-1' },
        bon: { reference: 'BON-1' },
        user: { displayName: '=Admin', email: 'admin@livio.fr' },
      },
      {
        createdAt: new Date('2026-01-10T08:00:00.000Z'),
        action: 'login_sso',
        userEmail: 'x@livio.fr',
        details: null,
        bon: null,
        user: null,
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, first, second] = csv.slice(1).split('\n');
    expect(header).toBe(AUDIT_CSV_HEADERS.map((h) => `"${h}"`).join(';'));
    expect(header).not.toMatch(/ip|agent/i);
    expect(first).toBe(`"2026-09-24 14:00:00";"bon_created";"'=Admin";"admin@livio.fr";"BON-1";"{""reference"":""BON-1""}"`);
    expect(second).toBe('"2026-01-10 09:00:00";"login_sso";"";"x@livio.fr";"";""');
  });
});
