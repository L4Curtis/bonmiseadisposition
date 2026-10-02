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

  it('refuse une ligne qui a un numéro mais ni article ni libellé : il serait perdu sans le dire', () => {
    const result = runBonValidation({
      ...baseValues,
      equipments: [newLine({ customLabel: 'Laptop A' }), newLine({ serialNumber: 'SN-ORPHELIN' })],
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: { equipments: 'Ligne 2 : choisissez un article du catalogue ou saisissez un libellé (un numéro est saisi).' },
    });
  });

  it('rejette un formulaire sans collaborateur sélectionné', () => {
    const result = runBonValidation({ ...baseValues, collaborateurId: '' });

    expect(result).toEqual({ success: false, fieldErrors: { collaborateur: 'Sélectionnez un collaborateur' } });
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
      expect(result.fieldErrors.equipments).toMatch(/Numéro de série en double/);
    }
  });

  it('rejette une date de restitution antérieure à la date de mise à disposition', () => {
    const result = runBonValidation({
      ...baseValues,
      dateRestitution: '2025-12-31',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.dateRestitution).toMatch(/ne peut pas précéder/);
    }
  });

  it('formulaire envoyé vide : toutes les erreurs à la fois, dans l’ordre de l’écran', () => {
    const result = runBonValidation({
      collaborateurId: '', filialeId: '', civilite: '', dateMiseDisposition: '', dateRestitution: '',
      equipments: [newLine()],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.fieldErrors)).toEqual(['civilite', 'filiale', 'collaborateur', 'dateMiseDisposition', 'equipments']);
      expect(result.fieldErrors).toEqual({
        civilite: 'Choisissez la civilité du collaborateur (Madame ou Monsieur).',
        filiale: 'Sélectionnez une filiale',
        collaborateur: 'Sélectionnez un collaborateur',
        dateMiseDisposition: 'Indiquez la date de mise à disposition',
        equipments: 'Ajoutez au moins un équipement',
      });
    }
  });

  it('signale la civilité manquante avec les autres erreurs, pas après elles', () => {
    const result = runBonValidation({ ...baseValues, civilite: '', collaborateurId: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.fieldErrors)).toEqual(['civilite', 'collaborateur']);
    }
  });
});
