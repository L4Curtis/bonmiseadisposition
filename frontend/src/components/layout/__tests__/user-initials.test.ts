import { describe, expect, it } from 'vitest';
import { userInitials } from '../user-initials';

describe('userInitials — une seule règle pour l’en-tête et le menu (CM n° 13)', () => {
  it('prénom et nom : première lettre de chacun', () => {
    expect(userInitials('Hugo Petit')).toBe('HP');
    expect(userInitials('Léa Martin')).toBe('LM');
    expect(userInitials('Jean-Pierre de la Fontaine')).toBe('JF');
    expect(userInitials('  émilie   durand ')).toBe('ÉD');
  });

  it('un seul mot : ses deux premières lettres ; rien : « ? »', () => {
    expect(userInitials('Direction')).toBe('DI');
    expect(userInitials('')).toBe('?');
    expect(userInitials(undefined)).toBe('?');
  });
});
