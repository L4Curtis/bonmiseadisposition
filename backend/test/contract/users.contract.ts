/**
 * Contrat de l'annuaire des utilisateurs (`/api/users`) et des actions
 * d'administration sur un compte (`/api/admin/users/:id/...`), appelés par
 * l'écran Utilisateurs, le formulaire de bon et la liste des bons. La gestion
 * des comptes est réservée à l'administrateur ; l'IT garde la recherche d'un
 * destinataire, la liste « Créé par » et la fiche d'une personne.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, AccessRule, describeRule, expectAccessRule, IT, rule } from './support/access';
import { nestError } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { arrayOf, expectShape } from './support/shape';
import { changeUserRole, itStaff, manualUsersImportResult, unlockUser, user, userPage } from './shapes/users';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

const ACCESS: readonly AccessRule[] = [
  rule('GET /users', ADMIN, () => '/users?page=1&limit=20'),
  rule('GET /users/search', IT, () => '/users/search?q=cam'),
  rule('GET /users/it-staff', IT),
  rule('GET /users/:id', IT, (d) => `/users/${d.people.collaborator.id}`),
  rule('POST /users/manual', ADMIN),
  rule('PATCH /users/:id/manual', ADMIN, (d) => `/users/${d.people.manual.id}/manual`),
  rule('GET /users/manual/export', ADMIN),
  rule('GET /users/manual/import/template', ADMIN),
  rule('POST /users/manual/import', ADMIN),
  rule('PATCH /admin/users/:id/role', ADMIN, (d) => `/admin/users/${d.people.direction.id}/role`),
  rule('POST /admin/users/:id/unlock', ADMIN, (d) => `/admin/users/${d.people.admin.id}/unlock`),
];

describe('Droits d’accès', () => {
  it.each(ACCESS.map((a) => [describeRule(a), a] as const))('%s', async (_label, access) => {
    await expectAccessRule(ctx.http, ctx.data, access);
  });
});

describe('Lecture de l’annuaire', () => {
  it('GET /users?page=&limit= : enveloppe { users, total, page, limit }', async () => {
    const res = await ctx.http.get('/users?page=1&limit=20', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, userPage);
  });

  it('GET /users sans `page` : tableau nu (même route, autre forme)', async () => {
    const res = await ctx.http.get('/users?role=admin', 'admin');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(user, { minLength: 1 }));
  });

  it('GET /users avec un rôle inconnu : 400', async () => {
    const res = await ctx.http.get('/users?role=inconnu', 'admin');
    expect(res.status).toBe(400);
    expectShape(res.body, nestError);
  });

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

  it('GET /users/search?q= : tableau nu d’utilisateurs', async () => {
    const res = await ctx.http.get('/users/search?q=cam', 'technician');
    expect(res.status).toBe(200);
    expectShape(res.body, arrayOf(user, { minLength: 1 }));
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

  it('PATCH /users/:id/manual sur un compte d’annuaire : refusé au format NestJS', async () => {
    const res = await ctx.http.patch(`/users/${ctx.data.people.collaborator.id}/manual`, 'admin', { department: 'X' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expectShape(res.body, nestError);
  });

  it('POST /users/manual/import : 201 et compte rendu ligne par ligne', async () => {
    const res = await ctx.http.post('/users/manual/import', 'admin', {
      items: [{ firstName: 'Lucie', lastName: 'Import' }, { firstName: '' }],
    });
    expect(res.status).toBe(201);
    expectShape(res.body, manualUsersImportResult);
  });

  it.each(['/users/manual/export', '/users/manual/import/template'])('GET %s : fichier CSV', async (path) => {
    const res = await ctx.http.get(path, 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"]+\.csv"$/);
  });
});

describe('Administration d’un compte', () => {
  it('PATCH /admin/users/:id/role : { id, role, isItStaff }', async () => {
    const res = await ctx.http.patch(`/admin/users/${ctx.data.people.otherCollaborator.id}/role`, 'admin', {
      role: 'technician',
    });
    expect(res.status).toBe(200);
    expectShape(res.body, changeUserRole);
  });

  it('POST /admin/users/:id/unlock : 201 et { unlocked, removed }', async () => {
    const res = await ctx.http.post(`/admin/users/${ctx.data.people.admin.id}/unlock`, 'admin');
    expect(res.status).toBe(201);
    expectShape(res.body, unlockUser);
  });
});
