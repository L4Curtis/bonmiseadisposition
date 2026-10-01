import { describe, expect, it } from 'vitest';
import { presentedReturnState } from '../bon-view';

const out = { returnedAt: null, notReturned: false };
const returned = { returnedAt: new Date('2026-09-20T10:00:00Z'), notReturned: false };

describe('presentedReturnState — état affiché d’un équipement sur la fiche', () => {
  it('bon clôturé « remplacé » : un équipement jamais rendu est repris sur le remplaçant, pas « chez le collaborateur »', () => {
    expect(presentedReturnState(out, 0, { status: 'archived', replacedBy: { id: 'remplacant' } })).toBe('replaced');
  });

  it('bon clôturé « remplacé » : un équipement rendu reste « rendu »', () => {
    expect(presentedReturnState(returned, 0, { status: 'archived', replacedBy: { id: 'remplacant' } })).toBe('returned');
  });

  it('original encore en cours tant que le remplaçant n’est pas signé : toujours chez le collaborateur', () => {
    expect(presentedReturnState(out, 0, { status: 'active', replacedBy: { id: 'remplacant' } })).toBe('out');
  });

  it('bon clôturé sans remplaçant : état inchangé', () => {
    expect(presentedReturnState(out, 0, { status: 'archived', replacedBy: null })).toBe('out');
  });
});
