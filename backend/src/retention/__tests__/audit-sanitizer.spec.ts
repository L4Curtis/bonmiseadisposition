import { sanitizeAuditDetails } from '../audit-sanitizer';

describe('sanitizeAuditDetails', () => {
  it('removes PII keys from a details object (cas nominal)', () => {
    const details = { message: 'bonjour', reason: 'oublié', bonId: 'bon-1' };

    const result = sanitizeAuditDetails(details);

    expect(result).toEqual({ bonId: 'bon-1' });
  });

  it('returns the original value unchanged when no PII key is present (cas limite)', () => {
    const details = { bonId: 'bon-1', count: 3 };

    const result = sanitizeAuditDetails(details);

    expect(result).toBe(details);
  });

  it('passes through null, arrays and primitives unchanged', () => {
    expect(sanitizeAuditDetails(null)).toBeNull();
    expect(sanitizeAuditDetails(['message', 'reason'])).toEqual(['message', 'reason']);
    expect(sanitizeAuditDetails('message')).toBe('message');
  });
});
