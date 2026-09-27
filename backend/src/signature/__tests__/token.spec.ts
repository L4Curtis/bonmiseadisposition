import {
  isReplacedToken,
  unusableLinkMessage,
  clampTokenValidityDays,
  computeTokenExpiresAt,
} from '../token';

describe('token (pure helpers)', () => {
  describe('isReplacedToken', () => {
    it('should be true for a token invalidated to epoch (sentinel)', () => {
      expect(isReplacedToken(new Date(0))).toBe(true);
      expect(isReplacedToken(new Date(1000))).toBe(true);
    });

    it('should be false for a token naturally expired (past the sentinel)', () => {
      expect(isReplacedToken(new Date(Date.now() - 1000))).toBe(false);
    });

    it('should be false for a still-valid token', () => {
      expect(isReplacedToken(new Date(Date.now() + 60_000))).toBe(false);
    });
  });

  describe('unusableLinkMessage', () => {
    it('dit le vrai motif d’un lien invalidé (R-038)', () => {
      expect(unusableLinkMessage({ tokenExpiresAt: new Date(0), invalidatedReason: 'in_person' }, 'sent_mise_dispo')).toBe(
        "Ce document se signe au guichet, avec l'équipe informatique.",
      );
      expect(unusableLinkMessage({ tokenExpiresAt: new Date(0), invalidatedReason: 'replaced' }, 'sent_restitution')).toBe(
        'Ce lien a été remplacé : un nouveau lien vous a été envoyé par email.',
      );
    });

    it('lien invalidé sans motif enregistré : motif déduit de l’état du bon', () => {
      expect(unusableLinkMessage({ tokenExpiresAt: new Date(0), invalidatedReason: null }, 'archived')).toBe(
        "Ce bon a été clôturé : il n'y a plus rien à signer.",
      );
    });

    it('lien expiré naturellement', () => {
      expect(unusableLinkMessage({ tokenExpiresAt: new Date(Date.now() - 1000) }, 'sent_mise_dispo')).toBe(
        'Ce lien de signature a expiré : demandez un nouveau lien depuis la page de signature.',
      );
    });
  });

  describe('clampTokenValidityDays', () => {
    it('should return the default when raw is null', () => {
      expect(clampTokenValidityDays(null, 7)).toBe(7);
    });

    it('should return the default when raw is not numeric', () => {
      expect(clampTokenValidityDays('not-a-number', 7)).toBe(7);
    });

    it('should clamp below 1 up to 1', () => {
      expect(clampTokenValidityDays('0', 7)).toBe(1);
      expect(clampTokenValidityDays('-5', 7)).toBe(1);
    });

    it('should clamp above 30 down to 30', () => {
      expect(clampTokenValidityDays('365', 7)).toBe(30);
    });

    it('should pass through a valid in-range value', () => {
      expect(clampTokenValidityDays('14', 7)).toBe(14);
    });
  });

  describe('computeTokenExpiresAt', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    it('should add validityDays for a non-in-person token', () => {
      const result = computeTokenExpiresAt(false, { validityDays: 7, inPersonValidityHours: 2, now });
      expect(result.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    });

    it('should add inPersonValidityHours for an in-person token, ignoring validityDays', () => {
      const result = computeTokenExpiresAt(true, { validityDays: 7, inPersonValidityHours: 2, now });
      expect(result.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
      // Bien en-deçà de la validité standard (7 jours)
      expect(result.getTime()).toBeLessThan(now.getTime() + 24 * 60 * 60 * 1000);
    });
  });
});
