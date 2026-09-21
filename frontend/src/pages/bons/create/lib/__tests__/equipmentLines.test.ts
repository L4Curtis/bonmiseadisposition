import { describe, it, expect } from 'vitest';
import {
  clampQuantity,
  duplicateLine,
  distributeSerialsFromLine,
  findDuplicateSerialIds,
  isNonEmptyLine,
  splitPastedSerials,
  MIN_CATALOG_QUANTITY,
  MAX_CATALOG_QUANTITY,
} from '../equipmentLines';
import { newLine } from '../../types';
import type { EquipmentLine } from '../../types';

describe('clampQuantity', () => {
  it('ramène une valeur en dessous du minimum à 1', () => {
    expect(clampQuantity(0)).toBe(MIN_CATALOG_QUANTITY);
    expect(clampQuantity(-5)).toBe(MIN_CATALOG_QUANTITY);
  });

  it('plafonne une valeur excessive à la borne haute', () => {
    expect(clampQuantity(9999)).toBe(MAX_CATALOG_QUANTITY);
  });

  it('tronque les valeurs décimales', () => {
    expect(clampQuantity(3.9)).toBe(3);
  });

  it('retombe sur le minimum pour une valeur non finie (NaN saisi)', () => {
    expect(clampQuantity(Number.NaN)).toBe(MIN_CATALOG_QUANTITY);
  });
});

describe('duplicateLine', () => {
  it('insère une copie juste après la ligne source, avec le même article et un numéro de série vide', () => {
    const lines: EquipmentLine[] = [
      newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420', serialNumber: 'SN-1' }),
      newLine({ customLabel: 'Souris' }),
    ];
    const result = duplicateLine(lines, lines[0]._id);

    expect(result).toHaveLength(3);
    expect(result[1].catalogItemId).toBe('c1');
    expect(result[1].catalogItemLabel).toBe('Dell Latitude 5420');
    expect(result[1].serialNumber).toBeUndefined();
    expect(result[1]._id).not.toBe(lines[0]._id);
    // La ligne suivante d'origine reste en dernière position
    expect(result[2]._id).toBe(lines[1]._id);
  });

  it("ne mute pas le tableau d'origine", () => {
    const lines: EquipmentLine[] = [newLine({ customLabel: 'Écran' })];
    const result = duplicateLine(lines, lines[0]._id);
    expect(lines).toHaveLength(1);
    expect(result).toHaveLength(2);
  });

  it('retourne une copie inchangée si l\'id est introuvable', () => {
    const lines: EquipmentLine[] = [newLine({ customLabel: 'Écran' })];
    const result = duplicateLine(lines, 'inconnu');
    expect(result).toEqual(lines);
    expect(result).not.toBe(lines);
  });
});

describe('splitPastedSerials', () => {
  it('sépare sur les retours à la ligne (copie Excel en colonne)', () => {
    expect(splitPastedSerials('SN-1\nSN-2\nSN-3')).toEqual(['SN-1', 'SN-2', 'SN-3']);
  });

  it('sépare sur les tabulations (copie Excel en ligne)', () => {
    expect(splitPastedSerials('SN-1\tSN-2\tSN-3')).toEqual(['SN-1', 'SN-2', 'SN-3']);
  });

  it('ignore les lignes vides et les espaces superflus', () => {
    expect(splitPastedSerials(' SN-1 \r\n\r\nSN-2\n')).toEqual(['SN-1', 'SN-2']);
  });

  it('retourne un tableau vide pour un texte vide', () => {
    expect(splitPastedSerials('   \n\t ')).toEqual([]);
  });
});

describe('distributeSerialsFromLine', () => {
  it('répartit une valeur par ligne existante à partir de la ligne courante', () => {
    const lines: EquipmentLine[] = [
      newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420' }),
      newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420' }),
      newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420' }),
    ];
    const result = distributeSerialsFromLine(lines, lines[0]._id, ['SN-1', 'SN-2', 'SN-3']);

    expect(result).toHaveLength(3);
    expect(result.map((l) => l.serialNumber)).toEqual(['SN-1', 'SN-2', 'SN-3']);
  });

  it('crée les lignes manquantes (même article que la ligne de départ) pour les valeurs excédentaires', () => {
    const lines: EquipmentLine[] = [
      newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420' }),
    ];
    const result = distributeSerialsFromLine(lines, lines[0]._id, ['SN-1', 'SN-2', 'SN-3']);

    expect(result).toHaveLength(3);
    expect(result.map((l) => l.serialNumber)).toEqual(['SN-1', 'SN-2', 'SN-3']);
    expect(result[1].catalogItemId).toBe('c1');
    expect(result[1].catalogItemLabel).toBe('Dell Latitude 5420');
    expect(result[2].catalogItemId).toBe('c1');
  });

  it('ne touche pas aux lignes précédant la ligne de départ', () => {
    const lines: EquipmentLine[] = [
      newLine({ customLabel: 'Écran', serialNumber: 'GARDE-MOI' }),
      newLine({ catalogItemId: 'c1' }),
    ];
    const result = distributeSerialsFromLine(lines, lines[1]._id, ['SN-1']);
    expect(result[0].serialNumber).toBe('GARDE-MOI');
    expect(result[1].serialNumber).toBe('SN-1');
  });

  it("retourne une copie inchangée si l'id de départ est introuvable ou la liste de valeurs vide", () => {
    const lines: EquipmentLine[] = [newLine({ customLabel: 'Écran' })];
    expect(distributeSerialsFromLine(lines, 'inconnu', ['SN-1'])).toEqual(lines);
    expect(distributeSerialsFromLine(lines, lines[0]._id, [])).toEqual(lines);
  });
});

describe('isNonEmptyLine', () => {
  it('considère vide une ligne sans aucune saisie', () => {
    expect(isNonEmptyLine(newLine({}))).toBe(false);
    expect(isNonEmptyLine(newLine({ customLabel: '   ' }))).toBe(false);
  });

  it.each([
    ['catalogItemId', { catalogItemId: 'c1' }],
    ['customLabel', { customLabel: 'Souris' }],
    ['serialNumber', { serialNumber: 'SN-1' }],
    ['inventoryNumber', { inventoryNumber: 'INV-1' }],
    ['notes', { notes: 'Reconditionné' }],
  ])('considère non vide une ligne avec %s renseigné', (_label, partial) => {
    expect(isNonEmptyLine(newLine(partial))).toBe(true);
  });
});

describe('findDuplicateSerialIds', () => {
  it('signale les lignes partageant le même numéro de série (insensible à la casse et aux espaces)', () => {
    const lines: EquipmentLine[] = [
      newLine({ serialNumber: 'SN-123' }),
      newLine({ serialNumber: ' sn-123 ' }),
      newLine({ serialNumber: 'SN-456' }),
    ];
    const duplicates = findDuplicateSerialIds(lines);
    expect(duplicates.has(lines[0]._id)).toBe(true);
    expect(duplicates.has(lines[1]._id)).toBe(true);
    expect(duplicates.has(lines[2]._id)).toBe(false);
  });

  it('ignore les lignes sans numéro de série', () => {
    const lines: EquipmentLine[] = [newLine({}), newLine({ serialNumber: '' })];
    expect(findDuplicateSerialIds(lines).size).toBe(0);
  });

  it('ne signale rien quand tous les numéros de série sont uniques', () => {
    const lines: EquipmentLine[] = [newLine({ serialNumber: 'SN-1' }), newLine({ serialNumber: 'SN-2' })];
    expect(findDuplicateSerialIds(lines).size).toBe(0);
  });
});
