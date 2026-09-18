import { describe, it, expect } from 'vitest';
import { buildCatalogCsv, parseCatalogCsv } from '../csv';

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

describe('buildCatalogCsv', () => {
  it('genere un CSV avec en-tete et echappe les champs contenant le separateur', () => {
    const csv = buildCatalogCsv([
      {
        category: 'pc_portable', brand: 'Lenovo', model: 'ThinkPad X1', description: 'Ultrabook; 14"',
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('categorie;marque;modele;description');
    expect(lines[1]).toBe('pc_portable;Lenovo;ThinkPad X1;"Ultrabook; 14"""');
  });
});
