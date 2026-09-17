import { toFilenamePart } from '../snapshot-regeneration';

// ─── toFilenamePart ─────────────────────────────────────────────────────────────
// Fragment de nom de fichier sûr (sans accents/espaces) utilisé pour nommer
// les PdfSnapshot régénérés.

describe('toFilenamePart', () => {
  it('strips accents and diacritics', () => {
    expect(toFilenamePart('Éric Ømega')).toBe('Eric-mega');
  });

  it('replaces spaces and punctuation with a single hyphen', () => {
    expect(toFilenamePart('Jean   Dupont')).toBe('Jean-Dupont');
    expect(toFilenamePart("d'Artagnan, René")).toBe('d-Artagnan-Rene');
  });

  it('trims leading and trailing hyphens', () => {
    expect(toFilenamePart('---Jean Dupont---')).toBe('Jean-Dupont');
  });

  it('falls back to INCONNU for an empty or fully-stripped input', () => {
    expect(toFilenamePart('')).toBe('INCONNU');
    expect(toFilenamePart('   ')).toBe('INCONNU');
    expect(toFilenamePart('———')).toBe('INCONNU');
  });
});
