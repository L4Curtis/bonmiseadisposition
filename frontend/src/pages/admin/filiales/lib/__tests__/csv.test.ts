import { describe, it, expect } from 'vitest';
import { parseFilialesCsv } from '../csv';

describe('parseFilialesCsv', () => {
  it('parse un CSV valide separe par des points-virgules', () => {
    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\n'
      + 'Fresse GDO;Fresse GDO SAS;12 rue des Fleurs;123456789;oui;;\n'
      + 'Autre Filiale;;;;;;\n';

    const { rows, invalidRows } = parseFilialesCsv(csv);

    expect(invalidRows).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        item: {
          name: 'Fresse GDO',
          displayName: 'Fresse GDO SAS',
          address: '12 rue des Fleurs',
          siret: '123456789',
          active: true,
          logoBase64: undefined,
          stampBase64: undefined,
        },
      },
      {
        line: 3,
        item: {
          name: 'Autre Filiale',
          displayName: undefined,
          address: undefined,
          siret: undefined,
          active: undefined,
          logoBase64: undefined,
          stampBase64: undefined,
        },
      },
    ]);
  });

  it('detecte automatiquement le separateur virgule', () => {
    const csv = 'nom,nom_affiche,adresse,siret,active,logo_base64,cachet_base64\nFiliale X,,,,,,\n';
    const { rows } = parseFilialesCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].item.name).toBe('Filiale X');
  });

  it('transmet les colonnes image telles quelles, sans les valider', () => {
    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\n'
      + 'Filiale;;;;;bG9nbw==;Y2FjaGV0\n';
    const { rows } = parseFilialesCsv(csv);
    // Aucune validation/réencodage côté client : le serveur valide les images.
    expect(rows[0].item.logoBase64).toBe('bG9nbw==');
    expect(rows[0].item.stampBase64).toBe('Y2FjaGV0');
  });

  it('rejette une ligne sans nom sans bloquer les autres lignes', () => {
    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\n'
      + ';Sans Nom;;;;;\n'
      + 'Valide;;;;;;\n';

    const { rows, invalidRows } = parseFilialesCsv(csv);

    expect(rows).toEqual([
      {
        line: 3,
        item: {
          name: 'Valide',
          displayName: undefined,
          address: undefined,
          siret: undefined,
          active: undefined,
          logoBase64: undefined,
          stampBase64: undefined,
        },
      },
    ]);
    expect(invalidRows).toEqual([{ line: 2, message: 'Nom obligatoire' }]);
  });

  it('rejette une valeur active invalide', () => {
    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\nFiliale;;;;peut-etre;;\n';
    const { rows, invalidRows } = parseFilialesCsv(csv);
    expect(rows).toEqual([]);
    expect(invalidRows).toEqual([{ line: 2, message: 'Valeur « active » invalide (oui/non attendu)' }]);
  });

  it('interprete non comme filiale desactivee', () => {
    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\nFiliale;;;;non;;\n';
    const { rows } = parseFilialesCsv(csv);
    expect(rows[0].item.active).toBe(false);
  });

  it("signale un en-tete invalide (colonne nom manquante)", () => {
    const csv = 'foo;bar\nval1;val2\n';
    const { rows, invalidRows } = parseFilialesCsv(csv);
    expect(rows).toEqual([]);
    expect(invalidRows).toHaveLength(1);
    expect(invalidRows[0].message).toMatch(/En-tête invalide/);
  });

  it('signale un fichier vide', () => {
    const { rows, invalidRows } = parseFilialesCsv('');
    expect(rows).toEqual([]);
    expect(invalidRows).toEqual([{ line: 1, message: 'Fichier vide' }]);
  });
});
