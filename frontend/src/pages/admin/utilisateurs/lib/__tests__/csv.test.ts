import { describe, it, expect } from 'vitest';
import { parseManualUsersCsv } from '../csv';

const HEADER = 'identifiant;prenom;nom;email;service;filiale;actif';

describe('parseManualUsersCsv', () => {
  it('lit les lignes de création et de mise à jour, cellules vides absentes', () => {
    const { rows, invalidRows } = parseManualUsersCsv([
      HEADER,
      ';Jean;Dupont;jean@exemple.fr;Chantier;Fresse GDO;oui',
      'manuel.anne.martin;Anne;Martin;;;;non',
    ].join('\n'));

    expect(invalidRows).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        item: {
          samAccountName: undefined, firstName: 'Jean', lastName: 'Dupont', email: 'jean@exemple.fr',
          department: 'Chantier', filiale: 'Fresse GDO', active: true,
        },
      },
      {
        line: 3,
        item: {
          samAccountName: 'manuel.anne.martin', firstName: 'Anne', lastName: 'Martin', email: undefined,
          department: undefined, filiale: undefined, active: false,
        },
      },
    ]);
  });

  it('ignore les lignes de commentaire du modèle et accepte le fichier exporté (guillemets, BOM)', () => {
    const { rows, invalidRows } = parseManualUsersCsv([
      '﻿"identifiant";"prenom";"nom";"email";"service";"filiale";"actif"',
      '"# Valeurs acceptées";"obligatoire";"obligatoire";"facultatif ; adresse valide";"";"";"oui ou non"',
      '"# Exemple";"Jean";"Dupont";"";"Chantier";"";"oui"',
      '"manuel.x.y";"Xavier";"Y";"";"Atelier; bâtiment B";"";"oui"',
    ].join('\r\n'));
    expect(invalidRows).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].item.department).toBe('Atelier; bâtiment B');
  });

  it('accepte le séparateur virgule et un ordre de colonnes quelconque', () => {
    const { rows } = parseManualUsersCsv('nom,prenom\nDupont,Jean');
    expect(rows[0].item).toMatchObject({ firstName: 'Jean', lastName: 'Dupont' });
  });

  it('rejette un en-tête sans prénom/nom et un fichier vide', () => {
    expect(parseManualUsersCsv('email;service\na@b.fr;x').invalidRows[0].message).toMatch(/En-tête invalide/);
    expect(parseManualUsersCsv('\n\n').invalidRows).toEqual([{ line: 1, message: 'Fichier vide' }]);
  });

  it('signale les lignes invalides avec leur numéro', () => {
    const { rows, invalidRows } = parseManualUsersCsv([
      HEADER,
      ';;Dupont;;;;',
      ';Jean;Dupont;pas-un-email;;;',
      ';Anne;Martin;;;;peut-être',
    ].join('\n'));
    expect(rows).toEqual([]);
    expect(invalidRows).toEqual([
      { line: 2, message: 'Prénom et nom obligatoires' },
      { line: 3, message: 'Email invalide (pas-un-email)' },
      { line: 4, message: 'Valeur « actif » invalide (oui/non attendu)' },
    ]);
  });

  it("détecte les doublons à l'intérieur du fichier", () => {
    const { rows, invalidRows } = parseManualUsersCsv([
      HEADER,
      ';Jean;Dupont;jean@exemple.fr;;;',
      ';Paul;Durand;JEAN@exemple.fr;;;',
      ';Zoé;Petit;;;;',
      ';Zoe;PETIT;;;;',
      'manuel.a.b;A;B;;;;',
      'MANUEL.A.B;A;B;;;;',
    ].join('\n'));
    expect(rows.map((r) => r.line)).toEqual([2, 4, 6]);
    expect(invalidRows).toEqual([
      { line: 3, message: 'Doublon de la ligne 2 (même email)' },
      { line: 5, message: 'Doublon de la ligne 4 (même prénom et nom)' },
      { line: 7, message: 'Doublon de la ligne 6 (même identifiant)' },
    ]);
  });
});
