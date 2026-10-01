import { AUDIT_CSV_HEADERS, buildAuditExportCsv, exportableDetails, formatAuditDate } from '../audit-csv';

describe('exportableDetails', () => {
  it('retire les clés personnelles connues de la rétention et les secrets', () => {
    expect(exportableDetails({
      created: 2, email: 'a@b.fr', targetEmail: 'c@d.fr', message: 'texte libre', reason: 'motif', resetToken: 'abc', passwordHash: 'x',
    })).toEqual({ created: 2 });
  });

  it('renvoie un objet vide quand il ne reste rien ou que la colonne est vide', () => {
    expect(exportableDetails(null)).toEqual({});
    expect(exportableDetails({ email: 'a@b.fr' })).toEqual({});
    expect(exportableDetails(['liste'])).toEqual({});
  });
});

describe('formatAuditDate', () => {
  it('écrit JJ/MM/AAAA HH:MM à l’heure de Paris (été comme hiver)', () => {
    expect(formatAuditDate(new Date('2026-09-24T12:05:59.000Z'))).toBe('24/09/2026 14:05');
    expect(formatAuditDate(new Date('2026-01-10T23:30:00.000Z'))).toBe('11/01/2026 00:30');
  });
});

describe('buildAuditExportCsv', () => {
  it('écrit une ligne lisible par entrée : date de Paris, libellé, phrase, auteur, bon — sans IP ni clé technique', () => {
    const csv = buildAuditExportCsv([
      {
        createdAt: new Date('2026-09-24T12:00:00.000Z'),
        action: 'audit_exported',
        userEmail: null,
        details: { rowCount: 571, truncated: false },
        bon: null,
        user: { displayName: '=Admin', email: 'admin@livio.fr' },
      },
      {
        createdAt: new Date('2026-01-10T08:00:00.000Z'),
        action: 'bon_cancelled',
        userEmail: 'x@livio.fr',
        details: { reason: 'doublon' },
        bon: { reference: 'BON-2026-0042' },
        user: null,
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, first, second] = csv.slice(1).split('\n');
    expect(header).toBe(AUDIT_CSV_HEADERS.map((h) => `"${h}"`).join(';'));
    expect(first).toBe(
      `"24/09/2026 14:00";"Journal d'audit exporté";"'=Admin a exporté le journal d'audit (lignes : 571).";"'=Admin";"admin@livio.fr";""`,
    );
    // Le motif, texte libre, ne sort pas du serveur : le segment facultatif disparaît.
    expect(second).toBe('"10/01/2026 09:00";"Bon annulé";"x@livio.fr a annulé le bon BON-2026-0042.";"";"x@livio.fr";"BON-2026-0042"');
    expect(csv).not.toMatch(/truncated|rowCount|bon_cancelled/);
  });

  it('garde lisible une ancienne action absente du catalogue', () => {
    const csv = buildAuditExportCsv([
      { createdAt: new Date('2026-01-10T08:00:00.000Z'), action: 'ancienne_action', userEmail: null, details: null, bon: null, user: null },
    ]);
    expect(csv).toContain('"ancienne_action";"Le système a effectué une action non répertoriée."');
  });
});
