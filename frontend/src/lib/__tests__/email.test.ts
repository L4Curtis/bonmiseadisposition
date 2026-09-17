import { describe, it, expect } from 'vitest';
import { isDeliverableEmail } from '../email';

describe('isDeliverableEmail', () => {
  it('accepte une adresse avec un domaine complet', () => {
    expect(isDeliverableEmail('jean.dupont@groupe-livio.com')).toBe(true);
  });
  it('refuse un compte technique sans domaine complet, une adresse vide ou absente', () => {
    expect(isDeliverableEmail('admin@local')).toBe(false);
    expect(isDeliverableEmail('')).toBe(false);
    expect(isDeliverableEmail(undefined)).toBe(false);
  });
});
