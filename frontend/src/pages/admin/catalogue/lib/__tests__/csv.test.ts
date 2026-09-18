import { describe, it, expect } from 'vitest';
import {
  buildCatalogCsv, buildCatalogTemplateCsv, escapeCsvCell, parseCatalogCsv,
} from '../csv';
import { CATEGORIES } from '../../types';

describe('parseCatalogCsv', () => {
  it('parse un CSV valide separe par des points-virgules', () => {
    const csv = 'categorie;marque;modele;description\n'
      + 'pc_portable;Lenovo;ThinkPad X1;Ultrabook\n'
      + 'ecran;Dell;U2720Q;\n';

    const { rows, invalidRows } = parseCatalogCsv(csv);

    expect(invalidRows).toEqual([]);
    expect(rows).toEqual([
      { line: 2, item: { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkPad X1', description: 'Ultrabook' } },
      { line: 3, item: { category: 'ecran', brand: 'Dell', model: 'U2720Q', description: '' } },
    ]);
  });

  it('detecte automatiquement le separateur virgule', () => {
    const csv = 'categorie,marque,modele,description\npc_fixe,HP,EliteDesk,\n';
    const { rows } = parseCatalogCsv(csv);
    expect(rows).toEqual([
      { line: 2, item: { category: 'pc_fixe', brand: 'HP', model: 'EliteDesk', description: '' } },
    ]);
  });

  it('rejette une categorie inconnue sans bloquer les autres lignes', () => {
    const csv = 'categorie;marque;modele;description\n'
      + 'zzz_invalide;Lenovo;ThinkPad;\n'
      + 'pc_portable;Apple;MacBook;\n';

    const { rows, invalidRows } = parseCatalogCsv(csv);

    expect(rows).toEqual([
      { line: 3, item: { category: 'pc_portable', brand: 'Apple', model: 'MacBook', description: '' } },
    ]);
    expect(invalidRows).toEqual([{ line: 2, message: 'Catégorie inconnue : « zzz_invalide »' }]);
  });

  it('rejette une ligne sans marque ou sans modele', () => {
    const csv = 'categorie;marque;modele;description\npc_fixe;;Optiplex;\n';
    const { rows, invalidRows } = parseCatalogCsv(csv);
    expect(rows).toEqual([]);
    expect(invalidRows).toEqual([{ line: 2, message: 'Marque et modèle obligatoires' }]);
  });

  it("signale un en-tete invalide", () => {
    const csv = 'foo;bar\nval1;val2\n';
    const { rows, invalidRows } = parseCatalogCsv(csv);
    expect(rows).toEqual([]);
    expect(invalidRows).toHaveLength(1);
    expect(invalidRows[0].message).toMatch(/En-tête invalide/);
  });

  it('signale un fichier vide', () => {
    const { rows, invalidRows } = parseCatalogCsv('');
    expect(rows).toEqual([]);
    expect(invalidRows).toEqual([{ line: 1, message: 'Fichier vide' }]);
  });
});

describe('escapeCsvCell — anti-injection de formule (parite avec le backend)', () => {
  it.each([
    ['=', '=SOMME(A1)'],
    ['+', '+1234567'],
    ['-', '-1234567'],
    ['@', '@cmd|/c calc'],
    ['tabulation', '\tcmd'],
    ['retour chariot', '\rcmd'],
  ])('préfixe d’une apostrophe une cellule commençant par « %s »', (_label, value) => {
    expect(escapeCsvCell(value)).toBe(`"'${value}"`);
  });

  it('n’altère pas une cellule sans caractère déclencheur de formule', () => {
    expect(escapeCsvCell('Dell')).toBe('"Dell"');
  });

  it('echappe une valeur contenant le separateur point-virgule', () => {
    expect(escapeCsvCell('Ultrabook; 14 pouces')).toBe('"Ultrabook; 14 pouces"');
  });

  it('double les guillemets internes', () => {
    expect(escapeCsvCell('12" écran')).toBe('"12"" écran"');
  });

  it('echappe un retour a la ligne interne', () => {
    expect(escapeCsvCell('ligne 1\nligne 2')).toBe('"ligne 1\nligne 2"');
  });
});

describe('buildCatalogCsv', () => {
  it('genere un CSV avec en-tete et echappe chaque cellule (guillemets systematiques)', () => {
    const csv = buildCatalogCsv([
      {
        category: 'pc_portable', brand: 'Lenovo', model: 'ThinkPad X1', description: 'Ultrabook; 14"',
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"categorie";"marque";"modele";"description"');
    expect(lines[1]).toBe('"pc_portable";"Lenovo";"ThinkPad X1";"Ultrabook; 14"""');
  });

  it('protege une valeur qui ressemble a une formule (injection CSV)', () => {
    const csv = buildCatalogCsv([
      {
        category: 'autre', brand: '=cmd', model: '+1', description: '',
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('"autre";"\'=cmd";"\'+1";""');
  });
});

describe('buildCatalogTemplateCsv', () => {
  it('genere une ligne d\'exemple pour chaque categorie autorisee', () => {
    const csv = buildCatalogTemplateCsv();
    const lines = csv.split('\r\n');
    const categoryKeys = Object.keys(CATEGORIES);

    expect(lines[0]).toBe('"categorie";"marque";"modele";"description"');
    expect(lines).toHaveLength(categoryKeys.length + 1);

    categoryKeys.forEach((key, idx) => {
      expect(lines[idx + 1].startsWith(`"${key}";`)).toBe(true);
    });
  });

  it('produit un CSV reimportable sans ligne invalide', () => {
    const csv = buildCatalogTemplateCsv();
    const { rows, invalidRows } = parseCatalogCsv(csv);
    expect(invalidRows).toEqual([]);
    expect(rows).toHaveLength(Object.keys(CATEGORIES).length);
  });
});
