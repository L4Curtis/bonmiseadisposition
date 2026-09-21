import { describe, it, expect } from 'vitest';
import { mapDuplicableEquipments } from '../duplicateBon';
import type { DuplicableBonEquipment } from '../duplicateBon';

describe('mapDuplicableEquipments — C3, repartir d\'un bon existant', () => {
  it("reprend l'article (catalogue) d'une ligne, sans numéro de série ni numéro d'inventaire", () => {
    const source: DuplicableBonEquipment[] = [
      { catalogItem: { id: 'c1', brand: 'Dell', model: 'Latitude 5420' }, customLabel: null },
    ];
    const [line] = mapDuplicableEquipments(source);

    expect(line.catalogItemId).toBe('c1');
    expect(line.catalogItemLabel).toBe('Dell Latitude 5420');
    expect(line.serialNumber).toBeUndefined();
    expect(line.inventoryNumber).toBeUndefined();
    expect(line.notes).toBeUndefined();
  });

  it('reprend un libellé personnalisé quand la ligne source n\'a pas d\'article de catalogue', () => {
    const source: DuplicableBonEquipment[] = [{ catalogItem: null, customLabel: 'Casque audio' }];
    const [line] = mapDuplicableEquipments(source);

    expect(line.catalogItemId).toBeUndefined();
    expect(line.customLabel).toBe('Casque audio');
  });

  it('génère un id local distinct pour chaque ligne', () => {
    const source: DuplicableBonEquipment[] = [
      { catalogItem: null, customLabel: 'Souris' },
      { catalogItem: null, customLabel: 'Clavier' },
    ];
    const lines = mapDuplicableEquipments(source);
    expect(lines[0]._id).not.toBe(lines[1]._id);
  });

  it('retourne un tableau vide pour un bon sans équipement', () => {
    expect(mapDuplicableEquipments([])).toEqual([]);
  });
});
