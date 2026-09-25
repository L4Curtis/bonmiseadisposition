/**
 * Contrat de l'administration (`/api/admin/*`), entièrement réservée à
 * l'administrateur : supervision, emails en échec, diagnostic SSO, export SMB,
 * configuration par rubrique, tests de connexion, synchronisation LDAP, PDF
 * manquants et rétention RGPD.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, rule } from './support/access';
import { nestError, ok } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { expectShape } from './support/shape';
import {
  adminStatus,
  configHealth,
  connectionTest,
  failedNotifications,
  generalConfig,
  ldapStatus,
  okMessage,
  pdfRegenerateMissing,
  rappelsConfig,
  retentionPurge,
  retentionRun,
  retentionStats,
  smbFailedExports,
  smbRetryAll,
  smbRetryOne,
  smbStatus,
  smtpConfig,
  ssoDiagnostic,
} from './shapes/admin';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const ACCESS: readonly AccessRule[] = [
  rule('GET /admin/notifications/failed', ADMIN, () => '/admin/notifications/failed?days=30'),
  rule('GET /admin/status', ADMIN),
  rule('GET /admin/sso/diagnostic', ADMIN),
  rule('GET /admin/smb/status', ADMIN),
  rule('GET /admin/smb/failed', ADMIN),
  rule('POST /admin/smb/retry/:id', ADMIN, () => '/admin/smb/retry/00000000-0000-4000-8000-000000000000'),
  rule('POST /admin/smb/retry-all', ADMIN),
  rule('GET /admin/config/health', ADMIN),
  rule('GET /admin/config/:category', ADMIN, () => '/admin/config/general'),
  rule('PUT /admin/config/:category', ADMIN, () => '/admin/config/general'),
  rule('POST /admin/config/test/ldap', ADMIN),
  rule('POST /admin/config/test/smtp', ADMIN),
  rule('POST /admin/config/test/entra', ADMIN),
  rule('POST /admin/config/test/smb', ADMIN),
  rule('GET /admin/ldap/status', ADMIN),
  rule('POST /admin/ldap/sync', ADMIN),
  rule('DELETE /admin/ldap/users', ADMIN),
  rule('POST /admin/pdf/regenerate-missing', ADMIN),
  rule('GET /admin/retention/preview', ADMIN),
  rule('POST /admin/retention/run', ADMIN),
  rule('GET /admin/retention/stats', ADMIN),
  rule('POST /admin/retention/purge', ADMIN),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Supervision', () => {
  it('GET /admin/notifications/failed?days=30 : { count, windowDays, items }', async () => {
    const res = await ctx.http.get('/admin/notifications/failed?days=30', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, failedNotifications);
  });

  it('GET /admin/status : version, base et tâches planifiées', async () => {
    const res = await ctx.http.get('/admin/status', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, adminStatus);
  });

  it('GET /admin/sso/diagnostic : tableau (vide sans connexion SSO)', async () => {
    const res = await ctx.http.get('/admin/sso/diagnostic', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, ssoDiagnostic);
  });

  it('GET /admin/config/health : neuf rubriques', async () => {
    const res = await ctx.http.get('/admin/config/health', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, configHealth);
  });
});

describe('Configuration', () => {
  it('PUT /admin/config/:category : { ok: true }', async () => {
    // Port local fermé : le test de connexion SMTP qui suit échoue aussitôt
    // (connexion refusée) au lieu d'attendre l'expiration d'un délai réseau.
    const res = await ctx.http.put('/admin/config/smtp', 'admin', { host: '127.0.0.1', port: '9', password: 'secret-contrat' });
    expect(res.status).toBe(200);
    expectShape(res.body, ok);
  });

  it('GET /admin/config/smtp : secret masqué, jamais renvoyé en clair', async () => {
    const res = await ctx.http.get('/admin/config/smtp', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, smtpConfig);
    expect(res.body.password).toBe('••••••••');
  });

  it('GET /admin/config/general : dictionnaire de chaînes', async () => {
    const res = await ctx.http.get('/admin/config/general', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, generalConfig);
  });

  it('GET /admin/config/rappels : clés absentes tant qu’elles ne sont pas enregistrées', async () => {
    const res = await ctx.http.get('/admin/config/rappels', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, rappelsConfig);
  });

  it('GET /admin/config/:category inconnue : 400', async () => {
    const res = await ctx.http.get('/admin/config/inconnue', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it.each(['ldap', 'smtp', 'entra', 'smb'])('POST /admin/config/test/%s : 200, échec porté par success: false', async (kind) => {
    const res = await ctx.http.post(`/admin/config/test/${kind}`, 'admin');
    expect(res.status).toBe(201);
    expectShape(res.body, connectionTest);
  });
});

describe('Export SMB', () => {
  it('GET /admin/smb/status désactivé : { enabled: false }', async () => {
    const res = await ctx.http.get('/admin/smb/status', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, smbStatus);
    expect(res.body.enabled).toBe(false);
  });

  it('POST /admin/smb/retry-all désactivé : 400', async () => {
    const res = await ctx.http.post('/admin/smb/retry-all', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

  it('export activé : compteurs, exports en échec, relance d’un export puis de tous', async () => {
    await ctx.http.put('/admin/config/smb', 'admin', { enabled: 'true', path: '/partage/inexistant-contrat' });
    const status = await ctx.http.get('/admin/smb/status', 'admin');
    expect(status.status).toBe(200);
    expectShape(status.body, smbStatus);
    expect(status.body.enabled).toBe(true);

    const failed = await ctx.http.get('/admin/smb/failed', 'admin');
    expect(failed.status).toBe(200);
    expectShape(failed.body, smbFailedExports);

    const failedExport = await ctx.prisma.smbExport.findFirstOrThrow({ where: { status: 'failed' } });
    const retryOne = await ctx.http.post(`/admin/smb/retry/${failedExport.id}`, 'admin');
    expect(retryOne.status).toBe(201);
    expectShape(retryOne.body, smbRetryOne);

    const retryAll = await ctx.http.post('/admin/smb/retry-all', 'admin');
    expect(retryAll.status).toBe(201);
    expectShape(retryAll.body, smbRetryAll);
  });
});

describe('Synchronisation LDAP', () => {
  it('GET /admin/ldap/status : état en mémoire de la dernière synchronisation', async () => {
    const res = await ctx.http.get('/admin/ldap/status', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, ldapStatus);
  });

  it('POST /admin/ldap/sync : lancée en arrière-plan, { ok, message }', async () => {
    const res = await ctx.http.post('/admin/ldap/sync', 'admin');
    expect(res.status).toBe(201);
    expectShape(res.body, okMessage);
  });
});

describe('PDF de preuve', () => {
  it('POST /admin/pdf/regenerate-missing : { regenerated, failed }', async () => {
    const res = await ctx.http.post('/admin/pdf/regenerate-missing', 'admin');
    expect(res.status).toBe(201);
    expectShape(res.body, pdfRegenerateMissing);
  });
});

describe('Rétention RGPD', () => {
  it('GET /admin/retention/preview', async () => {
    const res = await ctx.http.get('/admin/retention/preview', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, retentionRun);
  });

  it('POST /admin/retention/run en simulation puis pour de bon : même forme', async () => {
    const dryRun = await ctx.http.post('/admin/retention/run', 'admin', { dryRun: true });
    expect(dryRun.status).toBe(201);
    expectShape(dryRun.body, retentionRun);
    const run = await ctx.http.post('/admin/retention/run', 'admin', { dryRun: false });
    expect(run.status).toBe(201);
    expectShape(run.body, retentionRun);
  });

  it('GET /admin/retention/stats', async () => {
    const res = await ctx.http.get('/admin/retention/stats', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, retentionStats);
  });

  it('POST /admin/retention/purge : { ok, expiredTokens, oldAuditLogs }', async () => {
    const res = await ctx.http.post('/admin/retention/purge', 'admin');
    expect(res.status).toBe(201);
    expectShape(res.body, retentionPurge);
  });
});

// En dernier : désactive les comptes issus de l'annuaire du jeu de données.
describe('Désactivation des comptes LDAP', () => {
  it('DELETE /admin/ldap/users : { ok, message }', async () => {
    const res = await ctx.http.delete('/admin/ldap/users', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, okMessage);
  });
});
