import { describe, it, expect } from 'vitest';
import { runBonValidation } from '../validation';
import { newLine } from '../../types';

const baseValues = {
  collaborateurId: 'u1',
  filialeId: 'f1',
  civilite: 'mr' as const,
  dateMiseDisposition: '2026-01-01',
  dateRestitution: '',
  equipments: [newLine({ customLabel: 'Laptop A' })],
};

describe('runBonValidation', () => {
  it('accepte un formulaire valide et ne retient que les lignes réellement renseignées', () => {
    const result = runBonValidation({
      ...baseValues,
      equipments: [newLine({ customLabel: 'Laptop A' }), newLine()], // ligne vide ignorée
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.validEquipments).toHaveLength(1);
      expect(result.validEquipments[0].customLabel).toBe('Laptop A');
    }
  });

  it('rejette un formulaire sans collaborateur sélectionné', () => {
    const result = runBonValidation({ ...baseValues, collaborateurId: '' });

    expect(result).toEqual({ success: false, error: 'Sélectionnez un collaborateur' });
  });

  it('rejette deux équipements avec le même numéro de série (insensible à la casse/espaces)', () => {
    const result = runBonValidation({
      ...baseValues,
      equipments: [
        newLine({ customLabel: 'Laptop A', serialNumber: 'SN-123' }),
        newLine({ customLabel: 'Laptop B', serialNumber: ' sn-123 ' }),
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Numéro de série en double/);
    }
  });

  it('rejette une date de restitution antérieure à la date de mise à disposition', () => {
    const result = runBonValidation({
      ...baseValues,
      dateRestitution: '2025-12-31',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/ne peut pas précéder/);
    }
  });
});
