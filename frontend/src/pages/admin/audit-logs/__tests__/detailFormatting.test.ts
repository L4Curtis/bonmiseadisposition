import { describe, it, expect } from 'vitest';
import { formatDetailEntry, truncate } from '../detailFormatting';

describe('truncate', () => {
  it('laisse une chaîne courte inchangée', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });

  it('tronque et ajoute une ellipse au-delà de la longueur max', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde…');
  });
});

describe('formatDetailEntry', () => {
  it('retourne null pour une valeur vide, nulle ou indéfinie', () => {
    expect(formatDetailEntry('reason', null)).toBeNull();
    expect(formatDetailEntry('reason', undefined)).toBeNull();
    expect(formatDetailEntry('reason', '')).toBeNull();
  });

  it('traduit un type de snapshot connu', () => {
    expect(formatDetailEntry('type', 'signature_it_mise_disposition')).toBe('Signature IT — mise à disposition');
  });

  it('laisse un type inconnu tel quel', () => {
    expect(formatDetailEntry('type', 'inconnu_xyz')).toBe('inconnu_xyz');
  });

  it('tronque un sha256 à 10 caractères avec suffixe', () => {
    expect(formatDetailEntry('sha256', 'abcdef1234567890')).toBe('SHA-256 abcdef1234…');
  });

  it('traduit un statut de bon connu', () => {
    expect(formatDetailEntry('newStatus', 'draft')).toBe('Statut : Brouillon');
  });

  it('masque les booléens faux (isInPerson, signedByProxy, etc.)', () => {
    expect(formatDetailEntry('isInPerson', false)).toBeNull();
    expect(formatDetailEntry('isInPerson', true)).toBe('Présentiel');
    expect(formatDetailEntry('manual', false)).toBeNull();
  });

  it('masque les clés techniques (filename, titulaireEmail, attachmentId)', () => {
    expect(formatDetailEntry('filename', 'x.pdf')).toBeNull();
    expect(formatDetailEntry('titulaireEmail', 'a@b.com')).toBeNull();
    expect(formatDetailEntry('attachmentId', 'att-1')).toBeNull();
  });

  it('formate une taille en Ko arrondie', () => {
    expect(formatDetailEntry('size', 2048)).toBe('2 Ko');
    expect(formatDetailEntry('size', 100)).toBe('1 Ko');
  });

  it('utilise un libellé générique clé/valeur pour une clé inconnue', () => {
    expect(formatDetailEntry('customKey', 'valeur')).toBe('customKey : valeur');
  });
});
