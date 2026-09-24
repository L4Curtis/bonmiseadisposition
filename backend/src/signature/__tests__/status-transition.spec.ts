import { getNextBonStatus } from '../status-transition';

describe('getNextBonStatus (pure)', () => {
  it('should transition sent_mise_dispo to active for mise_disposition', () => {
    expect(getNextBonStatus('sent_mise_dispo', 'mise_disposition')).toBe('active');
  });

  it('should transition sent_restitution to archived for restitution', () => {
    expect(getNextBonStatus('sent_restitution', 'restitution')).toBe('archived');
  });

  // Trouvé par les tests de bout en bout : l'ordre « je déclare la perte, PUIS
  // je fais signer la restitution du reste » archivait le bon sans jamais
  // émettre le procès-verbal qui acte le matériel non rendu.
  it('should hold on partially_returned when an equipment is already declared not returned, so the PV can be issued', () => {
    expect(getNextBonStatus('sent_restitution', 'restitution', undefined, true)).toBe('partially_returned');
  });

  it('should still archive a restitution when nothing is declared not returned', () => {
    expect(getNextBonStatus('sent_restitution', 'restitution', undefined, false)).toBe('archived');
  });

  it('should not change the PV transition when an equipment is not returned (the PV is precisely what archives it)', () => {
    expect(getNextBonStatus('partially_returned', 'pv_cloture', undefined, true)).toBe('archived');
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
    const warn = vi.fn();
    const result = getNextBonStatus('active', 'mise_disposition', { warn });

    expect(result).toBe('active');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Invalid status transition');
  });

  it('should not warn when no logger is provided (optional dependency)', () => {
    expect(() => getNextBonStatus('active', 'mise_disposition')).not.toThrow();
  });
});
