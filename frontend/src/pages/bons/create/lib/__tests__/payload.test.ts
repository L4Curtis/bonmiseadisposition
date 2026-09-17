import { describe, it, expect } from 'vitest';
import { buildBonPayload } from '../payload';
import { newLine } from '../../types';

describe('buildBonPayload', () => {
  it('en création, omet les champs optionnels vides plutôt que de les envoyer', () => {
    const payload = buildBonPayload({
      filialeId: 'f1',
      collaborateurId: 'u1',
      civilite: 'mr',
      dateMiseDisposition: '2026-01-01',
      dateRestitution: '',
      notes: '',
      validEquipments: [newLine({ customLabel: 'Laptop A', serialNumber: 'SN-1' })],
      isEditing: false,
    });

    expect(payload.dateRestitution).toBeUndefined();
    expect(payload.notes).toBeUndefined();
    expect(payload.equipments).toEqual([
      {
        catalogItemId: undefined,
        customLabel: 'Laptop A',
        serialNumber: 'SN-1',
        inventoryNumber: undefined,
        notes: undefined,
        order: 0,
      },
    ]);
  });

  it('en édition, envoie explicitement null/chaîne vide pour effacer les champs optionnels', () => {
    const payload = buildBonPayload({
      filialeId: 'f1',
      collaborateurId: 'u1',
      civilite: 'mme',
      dateMiseDisposition: '2026-01-01',
      dateRestitution: '',
      notes: '',
      validEquipments: [],
      isEditing: true,
    });

    expect(payload.dateRestitution).toBeNull();
    expect(payload.notes).toBe('');
    expect(payload.equipments).toEqual([]);
  });

  it('numérote les équipements dans leur ordre d\'apparition', () => {
    const payload = buildBonPayload({
      filialeId: 'f1',
      collaborateurId: 'u1',
      civilite: 'mr',
      dateMiseDisposition: '2026-01-01',
      dateRestitution: '2026-02-01',
      notes: 'RAS',
      validEquipments: [
        newLine({ customLabel: 'A' }),
        newLine({ customLabel: 'B' }),
      ],
      isEditing: false,
    });

    expect(payload.equipments.map((e) => e.order)).toEqual([0, 1]);
  });
});
