import {
  buildManualDisplayName,
  buildManualSamAccountBase,
  generateUniqueManualSamAccountName,
  splitManualDisplayName,
} from '../manual-account.util';

describe('manual-account.util', () => {
  describe('buildManualDisplayName', () => {
    it('formats as "<Prénom> <NOM EN MAJUSCULES>"', () => {
      expect(buildManualDisplayName('Jean', 'Dupont')).toBe('Jean DUPONT');
    });

    it('uppercases an already-mixed-case last name and trims both parts', () => {
      expect(buildManualDisplayName('  Marie  ', '  martin  ')).toBe('Marie MARTIN');
    });
  });

  describe('buildManualSamAccountBase', () => {
    it('builds a prefixed, lowercase, accent-free base', () => {
      expect(buildManualSamAccountBase('Jean', 'Dupont')).toBe('manuel.jean.dupont');
    });

    it('strips accents and non-alphanumeric characters', () => {
      expect(buildManualSamAccountBase('Éric', "O'Brien-Müller")).toBe('manuel.eric.o-brien-muller');
    });

    it('collapses internal spaces to a single hyphen', () => {
      expect(buildManualSamAccountBase('Jean Paul', 'Van Der Berg')).toBe('manuel.jean-paul.van-der-berg');
    });
  });

  describe('generateUniqueManualSamAccountName', () => {
    it('returns the base unchanged when it is free', async () => {
      const exists = jest.fn().mockResolvedValue(false);
      const result = await generateUniqueManualSamAccountName('manuel.jean.dupont', exists);
      expect(result).toBe('manuel.jean.dupont');
      expect(exists).toHaveBeenCalledTimes(1);
    });

    it('suffixes -2 on a single collision', async () => {
      const exists = jest.fn()
        .mockResolvedValueOnce(true) // base taken
        .mockResolvedValueOnce(false); // -2 free
      const result = await generateUniqueManualSamAccountName('manuel.jean.dupont', exists);
      expect(result).toBe('manuel.jean.dupont-2');
    });

    it('keeps incrementing the suffix across multiple collisions', async () => {
      const exists = jest.fn()
        .mockResolvedValueOnce(true) // base
        .mockResolvedValueOnce(true) // -2
        .mockResolvedValueOnce(true) // -3
        .mockResolvedValueOnce(false); // -4 free
      const result = await generateUniqueManualSamAccountName('manuel.jean.dupont', exists);
      expect(result).toBe('manuel.jean.dupont-4');
      expect(exists).toHaveBeenCalledTimes(4);
    });
  });

  describe('splitManualDisplayName', () => {
    it('splits on the last space', () => {
      expect(splitManualDisplayName('Jean DUPONT')).toEqual({ firstName: 'Jean', lastName: 'DUPONT' });
    });

    it('handles a multi-word first name (last word treated as the last name)', () => {
      expect(splitManualDisplayName('Jean Paul MARTIN')).toEqual({ firstName: 'Jean Paul', lastName: 'MARTIN' });
    });

    it('falls back to the whole string for both parts when there is no space', () => {
      expect(splitManualDisplayName('Madonna')).toEqual({ firstName: 'Madonna', lastName: 'Madonna' });
    });
  });
});
