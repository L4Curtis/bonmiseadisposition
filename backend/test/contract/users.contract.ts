/**
 * Contrat des utilisateurs (`/api/users`) : annuaire, comptes créés à la main
 * et actions d'administration sur un compte (rôle, déverrouillage,
 * désactivation), appelés par l'écran Utilisateurs, le formulaire de bon et
 * la liste des bons. La gestion des comptes est réservée à l'administrateur ;
 * l'IT garde la recherche d'un destinataire, la liste « Créé par » et la fiche
 * d'une personne. Les anciens chemins `/api/admin/users/:id/...` restent servis
 * en alias dépréciés.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, IT, rule } from './support/access';
import { apiError } from './support/common-shapes';
import { AppConfigService } from '../../src/config/config.service';
import { ContractContext, startContractContext } from './support/context';
import { LOCAL_ADMIN_PASSWORD } from './support/fixtures';
import { expectShape } from './support/shape';
import { changeUserRole, itStaff, manualUsersImportResult, unlockUser, user, userPage, userSearch } from './shapes/users';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const ACCESS: readonly AccessRule[] = [
  rule('GET /users', ADMIN, () => '/users?page=1&limit=25'),
  rule('GET /users/search', IT, () => '/users/search?q=cam'),
  rule('GET /users/it-staff', IT),
  rule('GET /users/:id', IT, (d) => `/users/${d.people.collaborator.id}`),
  rule('POST /users/manual', ADMIN),
  rule('PATCH /users/:id/manual', ADMIN, (d) => `/users/${d.people.manual.id}/manual`),
  rule('GET /users/manual/export', ADMIN),
  rule('GET /users/manual/import/template', ADMIN),
  rule('POST /users/manual/import', ADMIN),
  rule('PATCH /users/:id/role', ADMIN, (d) => `/users/${d.people.direction.id}/role`),
  rule('POST /users/:id/unlock', ADMIN, (d) => `/users/${d.people.admin.id}/unlock`),
  rule('POST /users/:id/deactivate', ADMIN, (d) => `/users/${d.people.otherCollaborator.id}/deactivate`),
  rule('POST /users/:id/reactivate', ADMIN, (d) => `/users/${d.people.departed.id}/reactivate`),
  rule('PATCH /admin/users/:id/role', ADMIN, (d) => `/admin/users/${d.people.direction.id}/role`),
  rule('POST /admin/users/:id/unlock', ADMIN, (d) => `/admin/users/${d.people.admin.id}/unlock`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Lecture de l’annuaire', () => {
  it('GET /users : une seule forme, la liste paginée, avec l’état de l’annuaire', async () => {
    const res = await ctx.http.get('/users', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, userPage);
    expect(res.body).toMatchObject({ page: 1, limit: 25, meta: { directoryActive: false } });
  });

  it('GET /users?status= : comptes actifs par défaut, inactifs ou tous sur demande', async () => {
    const ids = async (query: string): Promise<string[]> => {
      const res = await ctx.http.get(`/users?limit=100${query}`, 'admin');
      expect(res.status).toBe(200);
      return (res.body as { items: { id: string }[] }).items.map((u) => u.id);
    };
    const departed = ctx.data.people.departed.id;
    expect(await ids('')).not.toContain(departed);
    expect(await ids('&status=inactive')).toEqual([departed]);
    expect(await ids('&status=all')).toContain(departed);
  });

  it('GET /users?origin=manual : les seuls comptes créés à la main (comptage avant l’export)', async () => {
    const res = await ctx.http.get('/users?origin=manual&status=all', 'admin');
    expect(res.status).toBe(200);
    expect((res.body as { items: { id: string }[] }).items.map((u) => u.id)).toEqual([ctx.data.people.manual.id]);
    expect(res.body.total).toBe(1);

    const invalid = await ctx.http.get('/users?origin=ad', 'admin');
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('validation_failed');
  });

  it('GET /users?search= : recherche sur le nom, l’email et l’identifiant', async () => {
    const res = await ctx.http.get('/users?search=camille', 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, items: [{ id: ctx.data.people.collaborator.id }] });
  });

  it.each(['limit=20', 'limit=0', 'page=0', 'role=inconnu', 'status=parti'])(
    'GET /users?%s : 400 validation_failed, jamais corrigé en silence',
    async (query) => {
      const res = await ctx.http.get(`/users?${query}`, 'admin');
      expect(res.status).toBe(400);
      expectShape(res.body, apiError);
      expect(res.body.code).toBe('validation_failed');
    },
  );

  it('GET /users/it-staff : administrateurs et techniciens actifs, { id, displayName }', async () => {
    const res = await ctx.http.get('/users/it-staff', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, itStaff);
  });

  it('GET /users/:id : la fiche d’une personne', async () => {
    const res = await ctx.http.get(`/users/${ctx.data.people.collaborator.id}`, 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, user);
  });

  it('GET /users/search?q= : liste de personnes actives', async () => {
    const res = await ctx.http.get('/users/search?q=cam', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, userSearch);
  });

  it('GET /users/search?q= : la civilité retenue sur le compte, pour préremplir le bon suivant', async () => {
    await ctx.prisma.user.update({ where: { id: ctx.data.people.collaborator.id }, data: { civilite: 'mme' } });
    const res = await ctx.http.get('/users/search?q=cam', 'technician');
    expect(res.status).toBe(200);
    const found = (res.body as { items: { id: string; civilite: string | null }[] }).items.find(
      (u) => u.id === ctx.data.people.collaborator.id,
    );
    expect(found?.civilite).toBe('mme');
  });
});

describe('Comptes créés à la main', () => {
  it('POST /users/manual : 201 et le compte créé', async () => {
    const res = await ctx.http.post('/users/manual', 'admin', {
      firstName: 'Jean',
      lastName: 'Compagnon',
      filialeId: ctx.data.filialeId,
    });
    expect(res.status).toBe(201);
    expectShape(res.body, user);
    expect(res.body.isManualAccount).toBe(true);
  });

  it('PATCH /users/:id/manual : le compte modifié', async () => {
    const res = await ctx.http.patch(`/users/${ctx.data.people.manual.id}/manual`, 'admin', { department: 'Chantier' });
    expect(res.status).toBe(200);
    expectShape(res.body, user);
  });

  it('PATCH /users/:id/manual sur un compte d’annuaire : 400 directory_account', async () => {
    const res = await ctx.http.patch(`/users/${ctx.data.people.collaborator.id}/manual`, 'admin', { department: 'X' });
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('directory_account');
  });

  it('POST /users/manual/import : 201 et compte rendu ligne par ligne', async () => {
    const res = await ctx.http.post('/users/manual/import', 'admin', {
      items: [{ firstName: 'Lucie', lastName: 'Import' }, { firstName: '' }],
    });
    expect(res.status).toBe(201);
    expectShape(res.body, manualUsersImportResult);
  });

  it.each([
    ['/users/manual/export', /^attachment; filename="collaborateurs-manuels-\d{4}-\d{2}-\d{2}\.csv"$/],
    ['/users/manual/import/template', /^attachment; filename="modele-import-collaborateurs\.csv"$/],
  ])('GET %s : fichier CSV nommé par le serveur', async (path, filename) => {
    const res = await ctx.http.get(path, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(filename);
  });
});

describe('Administration d’un compte', () => {
  it('PATCH /users/:id/role : { id, role, isItStaff }, tracé au journal', async () => {
    const target = ctx.data.people.otherCollaborator;
    const res = await ctx.http.patch(`/users/${target.id}/role`, 'admin', { role: 'technician' });
    expect(res.status).toBe(200);
    expectShape(res.body, changeUserRole);
    const entry = await ctx.prisma.auditLog.findFirst({ where: { action: 'user_role_changed' }, orderBy: { createdAt: 'desc' } });
    expect(entry?.details).toMatchObject({ targetUserId: target.id, from: 'collaborator', to: 'technician' });
  });

  it('PATCH /users/:id/role sur son propre compte : 400 own_account', async () => {
    const res = await ctx.http.patch(`/users/${ctx.data.people.admin.id}/role`, 'admin', { role: 'technician' });
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('own_account');
  });

  it('POST /users/:id/unlock : { unlocked, failedAttempts }, rien n’est effacé du journal', async () => {
    const admin = ctx.data.people.admin;
    await ctx.prisma.auditLog.create({ data: { action: 'login_local_failed', userEmail: admin.email, ipAddress: '10.9.9.9' } });
    const res = await ctx.http.post(`/users/${admin.id}/unlock`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, unlockUser);
    expect(res.body.failedAttempts).toBeGreaterThanOrEqual(1);
    const kept = await ctx.prisma.auditLog.count({ where: { action: 'login_local_failed', userEmail: admin.email } });
    expect(kept).toBeGreaterThanOrEqual(1);
  });

  it('verrou anti force brute : le déverrouillage le lève sans effacer les échecs du journal', async () => {
    const admin = ctx.data.people.admin;
    const ip = '10.201.0.1';
    const login = () => ctx.http
      .send('post', '/auth/local-login', 'anonymous', { email: admin.email, password: LOCAL_ADMIN_PASSWORD })
      .set('X-Forwarded-For', ip);
    await ctx.prisma.auditLog.createMany({
      data: Array.from({ length: 10 }, () => ({ action: 'login_local_failed', userEmail: admin.email, ipAddress: ip })),
    });

    const locked = await login();
    expect(locked.status).toBe(401);
    expect(locked.body.code).toBe('account_locked');

    expect((await ctx.http.post(`/users/${admin.id}/unlock`, 'admin')).status).toBe(200);
    expect((await login()).status).toBe(201);
    expect(await ctx.prisma.auditLog.count({
      where: { action: 'login_local_failed', userEmail: admin.email, ipAddress: ip },
    })).toBe(10);
  });

  it('annuaire inactif : POST /users/:id/deactivate puis /reactivate sur un compte d’annuaire, tracés', async () => {
    const target = ctx.data.people.direction;
    const off = await ctx.http.post(`/users/${target.id}/deactivate`, 'admin');
    expect(off.status).toBe(200);
    expectShape(off.body, user);
    expect(off.body).toMatchObject({ active: false, isManualAccount: false, isLocalAccount: false });
    // La session déjà ouverte de ce compte est refusée dès la requête suivante.
    expect((await ctx.http.get('/auth/me', 'direction')).status).toBe(401);

    const on = await ctx.http.post(`/users/${target.id}/reactivate`, 'admin');
    expect(on.status).toBe(200);
    expect(on.body.active).toBe(true);
    expect((await ctx.http.get('/auth/me', 'direction')).status).toBe(200);

    const entries = await ctx.prisma.auditLog.findMany({
      where: { action: { in: ['user_deactivated', 'user_reactivated'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((a) => a.action)).toEqual(['user_deactivated', 'user_reactivated']);
    expect(entries[0].details).toMatchObject({ targetUserId: target.id, displayName: target.displayName, account: 'directory' });
  });

  it('annuaire actif : POST /users/:id/deactivate sur un compte d’annuaire → 409 directory_active', async () => {
    const config = ctx.app.get(AppConfigService);
    await config.set('ldap', 'enabled', 'true');
    await config.set('ldap', 'url', 'ldap://annuaire.contrat.local');
    try {
      const res = await ctx.http.post(`/users/${ctx.data.people.otherCollaborator.id}/deactivate`, 'admin');
      expect(res.status).toBe(409);
      expectShape(res.body, apiError);
      expect(res.body.code).toBe('directory_active');
      const reactivate = await ctx.http.post(`/users/${ctx.data.people.departed.id}/reactivate`, 'admin');
      expect(reactivate.status).toBe(409);
      expect(reactivate.body.code).toBe('directory_active');
      const page = await ctx.http.get('/users', 'admin');
      expect(page.body.meta).toEqual({ directoryActive: true });
    } finally {
      await config.set('ldap', 'url', '');
      await config.set('ldap', 'enabled', 'false');
    }
  });

  it('POST /users/:id/deactivate sur son propre compte : 400 own_account', async () => {
    const res = await ctx.http.post(`/users/${ctx.data.people.admin.id}/deactivate`, 'admin');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('own_account');
  });
});

describe('Anciens chemins (alias dépréciés)', () => {
  it('PATCH /admin/users/:id/role : même traitement, en-têtes de dépréciation', async () => {
    const target = ctx.data.people.otherCollaborator;
    const res = await ctx.http.patch(`/admin/users/${target.id}/role`, 'admin', { role: 'collaborator' });
    expect(res.status).toBe(200);
    expectShape(res.body, changeUserRole);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toBe(`</api/users/${target.id}/role>; rel="successor-version"`);
  });

  it('POST /admin/users/:id/unlock : même traitement, en-têtes de dépréciation', async () => {
    const admin = ctx.data.people.admin;
    const res = await ctx.http.post(`/admin/users/${admin.id}/unlock`, 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, unlockUser);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toBe(`</api/users/${admin.id}/unlock>; rel="successor-version"`);
  });
});
