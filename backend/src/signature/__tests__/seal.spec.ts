import { buildSealPayload, computeSignatureIntegrity } from '../seal';

describe('seal (pure)', () => {
  describe('buildSealPayload', () => {
    const base = {
      bonId: 'bon-1',
      signatureId: 'sig-1',
      type: 'mise_disposition',
      signerEmail: 'Jean.Dupont@GroupeLivio.fr',
      signedAt: new Date('2026-01-01T10:00:00.000Z'),
      mentionLuApprouve: true,
      isInPerson: false,
      signedByProxy: false,
    };

    it('should normalize the email (lowercase, trim) inside the payload', () => {
      const payload = buildSealPayload(base);
      expect(payload).toContain('jean.dupont@groupelivio.fr');
      expect(payload).not.toContain('Jean.Dupont');
    });

    it('should encode booleans as 1/0 and be stable/deterministic', () => {
      const payload1 = buildSealPayload(base);
      const payload2 = buildSealPayload(base);
      expect(payload1).toBe(payload2);
      expect(payload1).toBe(
        'seal-v1|bon-1|sig-1|mise_disposition|jean.dupont@groupelivio.fr|2026-01-01T10:00:00.000Z|1|0|0',
      );
    });

    it('should handle a null signerEmail (anonymized bon) as an empty string', () => {
      const payload = buildSealPayload({ ...base, signerEmail: null });
      expect(payload).toBe('seal-v1|bon-1|sig-1|mise_disposition||2026-01-01T10:00:00.000Z|1|0|0');
    });
  });

  describe('computeSignatureIntegrity', () => {
    const signedAt = new Date('2026-01-01T00:00:00.000Z');
    const baseSig = {
      id: 'sig-1',
      bonId: 'bon-1',
      type: 'mise_disposition',
      signed: true,
      signerEmail: 'jean.dupont@groupelivio.fr',
      mentionLuApprouve: true,
      isInPerson: false,
      signedByProxy: false,
      seal: 'seal:valid',
      signedAt,
      tsToken: null,
      tsAuthority: null,
    };

    it('should mark sealValid null (and never call verifySeal) for an anonymized bon', () => {
      const verifySeal = jest.fn();
      const result = computeSignatureIntegrity([{ ...baseSig, signerEmail: null }], true, verifySeal);

      expect(result.allValid).toBe(true);
      expect(result.signatures[0].sealValid).toBeNull();
      expect(verifySeal).not.toHaveBeenCalled();
    });

    it('should compute sealValid via verifySeal for a non-anonymized, sealed signature', () => {
      const verifySeal = jest.fn().mockReturnValue(true);
      const result = computeSignatureIntegrity([baseSig], false, verifySeal);

      expect(verifySeal).toHaveBeenCalledTimes(1);
      expect(result.signatures[0].sealValid).toBe(true);
      expect(result.allValid).toBe(true);
    });

    it('should mark allValid false when any sealed signature fails verification', () => {
      const verifySeal = jest.fn().mockReturnValue(false);
      const result = computeSignatureIntegrity([baseSig], false, verifySeal);

      expect(result.signatures[0].sealValid).toBe(false);
      expect(result.allValid).toBe(false);
    });

    it('should leave sealValid null for an unsealed signature without invalidating allValid', () => {
      const verifySeal = jest.fn();
      const result = computeSignatureIntegrity([{ ...baseSig, seal: null }], false, verifySeal);

      expect(result.signatures[0].sealed).toBe(false);
      expect(result.signatures[0].sealValid).toBeNull();
      expect(result.allValid).toBe(true);
      expect(verifySeal).not.toHaveBeenCalled();
    });
  });
});
