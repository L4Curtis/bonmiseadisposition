import { describe, it, expect } from 'vitest';
import { bonCreateSchema, validate } from '../validation';

const baseInput = {
  collaborateurId: 'c1',
  filialeId: 'f1',
  dateMiseDisposition: '2026-01-01',
  civilite: 'mr' as const,
};

describe('bonCreateSchema — numéros de série uniques dans le bon', () => {
  it('rejette deux équipements avec le même numéro de série (F1-10)', () => {
    const result = validate(bonCreateSchema, {
      ...baseInput,
      equipments: [
        { customLabel: 'Laptop A', serialNumber: 'SN-123' },
        { customLabel: 'Laptop B', serialNumber: 'SN-123' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.values(result.errors)[0]).toContain('SN-123');
    }
  });

  it('détecte le doublon indépendamment de la casse et des espaces', () => {
    const result = validate(bonCreateSchema, {
      ...baseInput,
      equipments: [
        { customLabel: 'Laptop A', serialNumber: ' sn-123 ' },
        { customLabel: 'Laptop B', serialNumber: 'SN-123' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepte des numéros de série tous différents', () => {
    const result = validate(bonCreateSchema, {
      ...baseInput,
      equipments: [
        { customLabel: 'Laptop A', serialNumber: 'SN-123' },
        { customLabel: 'Laptop B', serialNumber: 'SN-456' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepte des équipements sans numéro de série', () => {
    const result = validate(bonCreateSchema, {
      ...baseInput,
      equipments: [
        { customLabel: 'Laptop A' },
        { customLabel: 'Laptop B' },
      ],
    });
    expect(result.success).toBe(true);
  });
});
