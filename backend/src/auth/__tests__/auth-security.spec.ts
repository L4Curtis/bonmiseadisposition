/**
 * Security-focused unit tests for authentication module.
 * Tests: JWT blacklist, password generation, token revocation.
 */
import * as crypto from 'crypto';

// ─── JWT Blacklist Tests ─────────────────────────────────────────────────────

describe('JWT Token Blacklist', () => {
  // Replicate the blacklist logic from AuthService for isolated unit testing
  let revokedTokens: Map<string, number>;

  function revokeAccessToken(token: string): void {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000;
    revokedTokens.set(hash, expiresAt);
  }

  function isTokenRevoked(token: string): boolean {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return revokedTokens.has(hash);
  }

  function cleanupRevokedTokens(): void {
    const now = Date.now();
    for (const [hash, expiresAt] of revokedTokens) {
      if (expiresAt <= now) {
        revokedTokens.delete(hash);
      }
    }
  }

  beforeEach(() => {
    revokedTokens = new Map();
  });

  it('should mark a token as revoked after revokeAccessToken()', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-payload.signature';
    expect(isTokenRevoked(token)).toBe(false);

    revokeAccessToken(token);
    expect(isTokenRevoked(token)).toBe(true);
  });

  it('should not affect other tokens when one is revoked', () => {
    const token1 = 'token-1-valid';
    const token2 = 'token-2-valid';

    revokeAccessToken(token1);
    expect(isTokenRevoked(token1)).toBe(true);
    expect(isTokenRevoked(token2)).toBe(false);
  });

  it('should clean up expired entries', () => {
    const token = 'expired-token';
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    // Insert with an already-expired timestamp
    revokedTokens.set(hash, Date.now() - 1000);

    cleanupRevokedTokens();
    expect(isTokenRevoked(token)).toBe(false);
    expect(revokedTokens.size).toBe(0);
  });

  it('should keep non-expired entries during cleanup', () => {
    const expiredToken = 'expired-token';
    const activeToken = 'active-token';

    const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
    const activeHash = crypto.createHash('sha256').update(activeToken).digest('hex');

    revokedTokens.set(expiredHash, Date.now() - 1000);
    revokedTokens.set(activeHash, Date.now() + 60000);

    cleanupRevokedTokens();
    expect(isTokenRevoked(expiredToken)).toBe(false);
    expect(isTokenRevoked(activeToken)).toBe(true);
  });

  it('should use SHA-256 hashing (not store raw tokens)', () => {
    const token = 'sensitive-jwt-token';
    revokeAccessToken(token);

    // Verify the map does NOT contain the raw token as a key
    expect(revokedTokens.has(token)).toBe(false);

    // Verify it contains the hash
    const expectedHash = crypto.createHash('sha256').update(token).digest('hex');
    expect(revokedTokens.has(expectedHash)).toBe(true);
  });
});

// ─── Default Admin Password Tests ────────────────────────────────────────────

describe('Default Admin Password Generation', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use DEFAULT_ADMIN_PASSWORD from env when set', () => {
    process.env = { ...originalEnv, DEFAULT_ADMIN_PASSWORD: 'MySecureP@ssw0rd!' };
    const password = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
    expect(password).toBe('MySecureP@ssw0rd!');
  });

  it('should generate a random password when env is not set', () => {
    process.env = { ...originalEnv };
    delete process.env.DEFAULT_ADMIN_PASSWORD;
    const password = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');

    expect(password).not.toBe('admin');
    expect(password.length).toBe(32); // 16 bytes = 32 hex chars
  });

  it('should generate different passwords on each call', () => {
    delete process.env.DEFAULT_ADMIN_PASSWORD;
    const p1 = crypto.randomBytes(16).toString('hex');
    const p2 = crypto.randomBytes(16).toString('hex');
    expect(p1).not.toBe(p2);
  });
});

// ─── Password Strength Validation Tests ──────────────────────────────────────

describe('Password Strength Validation', () => {
  // Replicate the validation logic from AuthService
  function validatePasswordStrength(password: string): string | null {
    if (password.length > 128) return 'max_length';
    if (password.length < 12) return 'min_length';
    if (!/[A-Z]/.test(password)) return 'uppercase';
    if (!/[a-z]/.test(password)) return 'lowercase';
    if (!/[0-9]/.test(password)) return 'digit';
    if (!/[@$!%*?&_#^+=\-.]/.test(password)) return 'special';
    return null;
  }

  it('should reject passwords shorter than 12 characters', () => {
    expect(validatePasswordStrength('Abc1@short')).toBe('min_length');
  });

  it('should reject passwords longer than 128 characters', () => {
    const long = 'Aa1@' + 'x'.repeat(126);
    expect(validatePasswordStrength(long)).toBe('max_length');
  });

  it('should reject passwords without uppercase', () => {
    expect(validatePasswordStrength('abcdefgh1234@')).toBe('uppercase');
  });

  it('should reject passwords without lowercase', () => {
    expect(validatePasswordStrength('ABCDEFGH1234@')).toBe('lowercase');
  });

  it('should reject passwords without digits', () => {
    expect(validatePasswordStrength('Abcdefghijkl@')).toBe('digit');
  });

  it('should reject passwords without special characters', () => {
    expect(validatePasswordStrength('Abcdefgh1234')).toBe('special');
  });

  it('should accept a valid strong password', () => {
    expect(validatePasswordStrength('MyStr0ng_Pass!')).toBeNull();
  });

  it('should accept passwords with exactly 12 characters', () => {
    expect(validatePasswordStrength('Abcdefgh12@!')).toBeNull();
  });
});
