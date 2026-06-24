import { EncryptionService } from '../encryption.service';

describe('EncryptionService', () => {
  let svc: EncryptionService;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'x'.repeat(64);
  });

  beforeEach(() => {
    svc = new EncryptionService();
    svc.onModuleInit();
  });

  describe('encrypt / decrypt', () => {
    it('round-trips a value', () => {
      const clear = 'données sensibles éàü';
      const cipher = svc.encrypt(clear);
      expect(cipher).not.toContain(clear);
      expect(svc.decrypt(cipher)).toBe(clear);
    });
  });

  describe('seal / verifySeal', () => {
    it('produces a deterministic 64-hex HMAC', () => {
      const a = svc.seal('payload|v1');
      const b = svc.seal('payload|v1');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changes when the payload changes', () => {
      expect(svc.seal('payload|a')).not.toBe(svc.seal('payload|b'));
    });

    it('verifies a matching seal', () => {
      const data = 'seal-v1|bon-1|sig-1|mise_disposition|a@b.fr|2026-06-24T10:00:00.000Z|1|0|0';
      const seal = svc.seal(data);
      expect(svc.verifySeal(data, seal)).toBe(true);
    });

    it('rejects a tampered payload (altération en base détectée)', () => {
      const data = 'seal-v1|bon-1|sig-1|mise_disposition|a@b.fr|2026-06-24T10:00:00.000Z|1|0|0';
      const seal = svc.seal(data);
      const tampered = data.replace('a@b.fr', 'attaquant@evil.fr');
      expect(svc.verifySeal(tampered, seal)).toBe(false);
    });

    it('rejects a malformed seal', () => {
      expect(svc.verifySeal('whatever', 'not-hex')).toBe(false);
      expect(svc.verifySeal('whatever', '')).toBe(false);
    });

    it('uses a distinct key from encryption (seal ≠ ciphertext)', () => {
      const data = 'abc';
      expect(svc.seal(data)).not.toBe(svc.encrypt(data));
    });
  });
});
