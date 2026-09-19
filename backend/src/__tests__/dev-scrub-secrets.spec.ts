/**
 * Garde-fou de backend/scripts/dev-scrub-secrets.js : le script assainit une
 * base de développement des VRAIS secrets de production (SMTP, Entra, LDAP,
 * SMB). Il ne doit JAMAIS pouvoir s'exécuter contre autre chose qu'une base
 * locale — d'où ce test isolé, sans Prisma ni réseau, du garde-fou pur.
 *
 * Le script est en JavaScript brut (même style que reset-admin-password.js),
 * sans allowJs dans tsconfig : son module est donc `require`-é ici plutôt
 * qu'importé (cf. import-order.spec.ts pour le même procédé).
 */
const {
  assertLocalDevEnvironment,
  SECRET_KEYS_TO_DELETE,
} = require('../../scripts/dev-scrub-secrets');

describe('assertLocalDevEnvironment', () => {
  it('autorise une base localhost hors production', () => {
    const result = assertLocalDevEnvironment({
      nodeEnv: 'development',
      databaseUrl: 'postgresql://app:devpassword@localhost:5432/bons_disposition',
    });
    expect(result.ok).toBe(true);
  });

  it.each(['127.0.0.1', '::1', 'localhost'])('autorise l\'hôte local %s', (host) => {
    const databaseUrl =
      host === '::1'
        ? 'postgresql://app:pwd@[::1]:5432/bons_disposition'
        : `postgresql://app:pwd@${host}:5432/bons_disposition`;
    const result = assertLocalDevEnvironment({ nodeEnv: 'development', databaseUrl });
    expect(result.ok).toBe(true);
  });

  it('refuse en NODE_ENV=production même contre une base locale', () => {
    const result = assertLocalDevEnvironment({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://app:pwd@localhost:5432/bons_disposition',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/production/i);
  });

  it('refuse si DATABASE_URL est absent', () => {
    const result = assertLocalDevEnvironment({ nodeEnv: 'development', databaseUrl: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/DATABASE_URL/);
  });

  it('refuse un hôte distant (base de production)', () => {
    const result = assertLocalDevEnvironment({
      nodeEnv: 'development',
      databaseUrl: 'postgresql://app:pwd@db.prod.livio.internal:5432/bons_disposition',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/db\.prod\.livio\.internal/);
  });

  it('refuse une DATABASE_URL illisible', () => {
    const result = assertLocalDevEnvironment({ nodeEnv: 'development', databaseUrl: 'pas-une-url' });
    expect(result.ok).toBe(false);
  });
});

describe('SECRET_KEYS_TO_DELETE', () => {
  it('couvre au minimum les secrets réels mentionnés dans la mission', () => {
    const asStrings = SECRET_KEYS_TO_DELETE.map((k: { category: string; key: string }) => `${k.category}.${k.key}`);
    expect(asStrings).toEqual(
      expect.arrayContaining([
        'smtp.password',
        'smtp.user',
        'entra.client_secret',
        'ldap.bind_password',
        'smb.password',
      ]),
    );
  });
});
