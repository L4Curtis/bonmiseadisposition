import {
  MANUAL_USERS_CSV_HEADERS, buildManualUsersExportCsv, buildManualUsersImportTemplateCsv,
} from '../users-csv';

const BOM = String.fromCharCode(0xfeff);

function linesOf(csv: string): string[] {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv.slice(1).split('\n');
}

describe('buildManualUsersExportCsv', () => {
  it('écrit l\'en-tête puis une ligne par compte manuel, prénom et nom séparés', () => {
    const csv = buildManualUsersExportCsv([
      {
        samAccountName: 'manuel.jean.dupont',
        displayName: 'Jean DUPONT',
        email: 'jean@exemple.fr',
        department: 'Chantier',
        active: true,
        filiale: { name: 'Fresse GDO' },
      },
      {
        samAccountName: 'manuel.anne.martin',
        displayName: 'Anne MARTIN',
        email: null,
        department: null,
        active: false,
        filiale: null,
      },
    ]);
    const [header, first, second] = linesOf(csv);
    expect(header).toBe(MANUAL_USERS_CSV_HEADERS.map((h) => `"${h}"`).join(';'));
    expect(first).toBe('"manuel.jean.dupont";"Jean";"DUPONT";"jean@exemple.fr";"Chantier";"Fresse GDO";"oui"');
    expect(second).toBe('"manuel.anne.martin";"Anne";"MARTIN";"";"";"";"non"');
  });

  it('neutralise une cellule qui commencerait une formule', () => {
    const csv = buildManualUsersExportCsv([
      {
        samAccountName: 'manuel.x.y',
        displayName: 'X Y',
        email: null,
        department: '=HYPERLINK("http://evil")',
        active: true,
        filiale: null,
      },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('buildManualUsersImportTemplateCsv', () => {
  it('rappelle les valeurs acceptées dans une ligne # et liste les filiales actives', () => {
    const [header, reminder, example] = linesOf(buildManualUsersImportTemplateCsv(['Fresse GDO', 'Livio']));
    expect(header).toContain('"identifiant";"prenom";"nom"');
    expect(reminder.startsWith('"# Valeurs acceptées')).toBe(true);
    expect(reminder).toContain('Fresse GDO, Livio');
    expect(reminder).toContain('oui ou non');
    expect(example.startsWith('"# Exemple')).toBe(true);
    expect(reminder.split('";"')).toHaveLength(MANUAL_USERS_CSV_HEADERS.length);
  });

  it('reste lisible sans filiale active', () => {
    const [, reminder] = linesOf(buildManualUsersImportTemplateCsv([]));
    expect(reminder).toContain('(aucune filiale active)');
  });
});
