/**
 * Contrat du registre de la configuration (GET /api/admin/config/registry) :
 * pour chaque réglage, valeur saisie, défaut et valeur appliquée, sans aucun
 * secret en clair. Consommé par l'écran Configuration (« valeur appliquée :
 * X (par défaut) »).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigCategory } from '../../src/contracts/admin';
import type { ConfigRegistryEntry, ConfigScalar } from '../../src/contracts/config-registry';
import { ADMIN, describeRule, expectAccessRule, rule } from './support/access';
import { listOf } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { bool, expectShape, int, literal, nullable, object, oneOf, Shape, str } from './support/shape';

const ACCESS = [rule('GET /admin/config/registry', ADMIN)];

const category: Shape<ConfigCategory> = literal(
  'general',
  'entra',
  'ldap',
  'smtp',
  'smb',
  'rappels',
  'tokens',
  'timestamp',
  'retention',
);
const scalar: Shape<ConfigScalar> = oneOf(str, int, bool);

const registryEntry = object<ConfigRegistryEntry>({
  key: str,
  category,
  name: str,
  label: str,
  type: literal('boolean', 'integer', 'string', 'url', 'email', 'secret'),
  min: nullable(int),
  max: nullable(int),
  secret: bool,
  adminOnly: bool,
  healthSection: category,
  storedValue: nullable(str),
  defaultValue: nullable(scalar),
  appliedValue: nullable(scalar),
  source: literal('stored', 'environment', 'default'),
  adjusted: bool,
});

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

describe('Accès', () => {
  it.each(ACCESS.map((access) => [describeRule(access), access] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('GET /admin/config/registry', () => {
  it('200, liste complète à la forme unique', async () => {
    const res = await ctx.http.get('/admin/config/registry', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, listOf(registryEntry, { minLength: 1 }));
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(res.body.total);
  });

  it('valeur saisie, défaut et appliquée ; secret jamais en clair', async () => {
    await ctx.prisma.appConfig.createMany({
      data: [
        { category: 'tokens', key: 'expiry_days', value: '90' },
        { category: 'smtp', key: 'password', value: 'non-chiffre-pour-le-test', encrypted: false },
      ],
    });
    const res = await ctx.http.get('/admin/config/registry', 'admin');
    const byKey = new Map<string, ConfigRegistryEntry>(res.body.items.map((e: ConfigRegistryEntry) => [e.key, e]));

    expect(byKey.get('tokens.expiry_days')).toMatchObject({
      storedValue: '90',
      defaultValue: 7,
      appliedValue: 30,
      source: 'stored',
      adjusted: true,
    });
    expect(byKey.get('rappels.delay_1')).toMatchObject({ storedValue: null, appliedValue: 3, source: 'default' });
    expect(byKey.get('general.app_url')).toMatchObject({ appliedValue: 'http://localhost:5173', source: 'environment' });
    expect(JSON.stringify(res.body)).not.toContain('non-chiffre-pour-le-test');
  });
});

