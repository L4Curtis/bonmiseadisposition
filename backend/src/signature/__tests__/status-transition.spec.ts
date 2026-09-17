import { getNextBonStatus } from '../status-transition';

describe('getNextBonStatus (pure)', () => {
  it('should transition sent_mise_dispo to active for mise_disposition', () => {
    expect(getNextBonStatus('sent_mise_dispo', 'mise_disposition')).toBe('active');
  });

  it('should transition sent_restitution to archived for restitution', () => {
    expect(getNextBonStatus('sent_restitution', 'restitution')).toBe('archived');
  });

  it('should keep partially_returned for a partial restitution', () => {
    expect(getNextBonStatus('partially_returned', 'restitution')).toBe('partially_returned');
  });

  it('should transition partially_returned to archived for pv_cloture', () => {
    expect(getNextBonStatus('partially_returned', 'pv_cloture')).toBe('archived');
  });

  it('should keep the current status for an invalid transition', () => {
    expect(getNextBonStatus('active', 'mise_disposition')).toBe('active');
  });

  it('should warn via the provided logger on an invalid transition, without throwing', () => {
    const warn = jest.fn();
    const result = getNextBonStatus('active', 'mise_disposition', { warn });

    expect(result).toBe('active');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Invalid status transition');
  });

  it('should not warn when no logger is provided (optional dependency)', () => {
    expect(() => getNextBonStatus('active', 'mise_disposition')).not.toThrow();
  });
});
