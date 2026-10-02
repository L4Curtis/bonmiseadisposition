import { describe, expect, it } from 'vitest';
import { documentChanges, documentChangesLabel, DocumentState } from '../bon-document-diff';

const bon: DocumentState = {
  filialeId: 'f1',
  collaborateurId: 'c1',
  civilite: 'mme',
  dateMiseDisposition: new Date('2026-09-20'),
  dateRestitution: null,
  notes: 'Chargeur fourni',
  equipments: [
    { catalogItemId: 'cat-1', customLabel: null, serialNumber: 'SN-1', inventoryNumber: null, notes: null },
    { catalogItemId: null, customLabel: 'Souris', serialNumber: null, inventoryNumber: 'INV-2', notes: null },
  ],
};

const sameForm = {
  filialeId: 'f1',
  collaborateurId: 'c1',
  civilite: 'mme',
  dateMiseDisposition: '2026-09-20',
  dateRestitution: null,
  notes: 'Chargeur fourni',
  equipments: [
    { catalogItemId: 'cat-1', serialNumber: 'SN-1' },
    { customLabel: ' Souris ', inventoryNumber: 'INV-2' },
  ],
};

describe('documentChanges', () => {
  it('le formulaire renvoyé tel quel, note interne comprise, ne change pas le document', () => {
    expect(documentChanges(bon, { ...sameForm, internalNote: 'Rappeler lundi' })).toEqual([]);
  });

  it('une série corrigée, une ligne en moins ou dans un autre ordre changent le document', () => {
    expect(documentChanges(bon, { equipments: [{ catalogItemId: 'cat-1', serialNumber: 'SN-9' }, sameForm.equipments[1]] }))
      .toEqual(['equipments']);
    expect(documentChanges(bon, { equipments: [sameForm.equipments[0]] })).toEqual(['equipments']);
    expect(documentChanges(bon, { equipments: [sameForm.equipments[1], sameForm.equipments[0]] })).toEqual(['equipments']);
  });

  it('remarques, dates et civilité comptent ; une remarque vidée vaut « aucune »', () => {
    expect(documentChanges(bon, { notes: 'Autre remarque', civilite: 'mr' })).toEqual(['civilite', 'notes']);
    expect(documentChanges(bon, { dateRestitution: '2026-12-01', dateMiseDisposition: '2026-09-21' }))
      .toEqual(['dateMiseDisposition', 'dateRestitution']);
    expect(documentChanges({ ...bon, notes: null }, { notes: '   ' })).toEqual([]);
  });
});

describe('documentChangesLabel', () => {
  it('nomme les champs changés comme l’écran, dans l’ordre', () => {
    expect(documentChangesLabel(['dateRestitution', 'equipments'])).toBe('restitution prévue, équipements');
    expect(documentChangesLabel([])).toBe('');
  });
});
