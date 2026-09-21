import { describe, it, expect, beforeEach } from 'vitest';
import { clearDraft, isMeaningfulDraft, readDraft, writeDraft } from '../draftStorage';
import type { BonDraftData } from '../draftStorage';
import { newLine } from '../../types';

const blankDraft: BonDraftData = {
  collaborateur: null,
  filialeId: '',
  civilite: 'mr',
  dateMiseDisposition: '2026-09-21',
  dateRestitution: '',
  notes: '',
  equipments: [newLine({})],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('isMeaningfulDraft — C5, brouillon conservé', () => {
  it("n'est pas significatif quand seule la date du jour est pré-remplie", () => {
    expect(isMeaningfulDraft(blankDraft)).toBe(false);
  });

  it('est significatif dès qu\'un collaborateur est choisi', () => {
    expect(isMeaningfulDraft({
      ...blankDraft,
      collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' },
    })).toBe(true);
  });

  it('est significatif dès qu\'une ligne d\'équipement contient une saisie', () => {
    expect(isMeaningfulDraft({
      ...blankDraft,
      equipments: [newLine({ customLabel: 'Souris' })],
    })).toBe(true);
  });

  it('est significatif dès que des notes sont saisies', () => {
    expect(isMeaningfulDraft({ ...blankDraft, notes: 'Écran fissuré' })).toBe(true);
  });
});

describe('writeDraft / readDraft / clearDraft', () => {
  it('relit exactement ce qui a été écrit (hors id local des lignes)', () => {
    const draft: BonDraftData = {
      ...blankDraft,
      collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr', filialeId: 'f1' },
      filialeId: 'f1',
      notes: 'RAS',
      equipments: [newLine({ customLabel: 'Souris', notes: 'Sans fil' })],
    };
    writeDraft(draft);
    const restored = readDraft();

    expect(restored?.collaborateur).toEqual(draft.collaborateur);
    expect(restored?.filialeId).toBe('f1');
    expect(restored?.notes).toBe('RAS');
    expect(restored?.equipments).toHaveLength(1);
    expect(restored?.equipments[0].customLabel).toBe('Souris');
    expect(restored?.equipments[0].notes).toBe('Sans fil');
  });

  it("régénère des id locaux (jamais ceux de l'ancienne session, pour éviter toute collision)", () => {
    const original = newLine({ customLabel: 'Écran' });
    writeDraft({ ...blankDraft, equipments: [original] });
    const restored = readDraft();
    expect(restored?.equipments[0]._id).not.toBe(original._id);
  });

  it('renvoie null en l\'absence de brouillon', () => {
    expect(readDraft()).toBeNull();
  });

  it('renvoie null pour un contenu corrompu, sans lever d\'exception', () => {
    window.localStorage.setItem('bon-create-draft:v1', '{ceci n\'est pas du JSON');
    expect(readDraft()).toBeNull();
  });

  it('renvoie null pour un objet sans tableau equipments', () => {
    window.localStorage.setItem('bon-create-draft:v1', JSON.stringify({ notes: 'x' }));
    expect(readDraft()).toBeNull();
  });

  it('clearDraft retire le brouillon enregistré', () => {
    writeDraft(blankDraft);
    clearDraft();
    expect(readDraft()).toBeNull();
  });
});
