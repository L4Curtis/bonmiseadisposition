/**
 * Contrat des routes d'authentification (`/api/auth/*`), appelées par
 * AuthContext, Login, ChangePassword et la boîte « Changer mon mot de passe ».
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiError, ok } from './support/common-shapes';
import { ContractContext, startContractContext } from './support/context';
import { EMAILS, LOCAL_ADMIN_PASSWORD } from './support/fixtures';
import { ONE_PERSONA_PER_ROLE } from './support/http';
import { expectShape } from './support/shape';
import { authMe, localAuthStatus, localLogin, setupRequired } from './shapes/users';

let ctx: ContractContext;

beforeAll(async () => {
  ctx = await startContractContext();
});

afterAll(async () => {
  await ctx?.close();
});

/** Cookies posés par une réponse, au format attendu par l'en-tête Cookie. */
function cookiesFrom(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((cookie) => cookie.split(';')[0]).join('; ');
}

/**
 * Attend la seconde suivante. Le jeton d'accès ne porte que `sub`, `email`,
 * `role` et `iat` (en secondes) : deux connexions dans la même seconde
 * produisent le MÊME jeton, et la déconnexion testée plus haut l'a révoqué.
 */
async function waitForNextSecond(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1000 - (Date.now() % 1000) + 20));
}

async function loginAsLocalAdmin(): Promise<string> {
  const res = await ctx.http.post('/auth/local-login', 'anonymous', { email: EMAILS.admin, password: LOCAL_ADMIN_PASSWORD });
  expect(res.status).toBe(201);
  return cookiesFrom(res.headers['set-cookie']);
}

describe('GET /auth/me', () => {
  it('401 sans session', async () => {
    const res = await ctx.http.get('/auth/me', 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });

  it.each(ONE_PERSONA_PER_ROLE)('200 et forme AuthMeResponse pour %s', async (persona) => {
    const res = await ctx.http.get('/auth/me', persona);
    expect(res.status).toBe(200);
    expectShape(res.body, authMe);
    expect(res.body.id).toBe(ctx.data.people[persona].id);
  });
});

describe('Routes publiques de la page de connexion', () => {
  it('GET /auth/setup-required : 200 sans session', async () => {
    const res = await ctx.http.get('/auth/setup-required', 'anonymous');
    expect(res.status).toBe(200);
    expectShape(res.body, setupRequired);
  });

  it('GET /auth/local-auth-status : 200 sans session', async () => {
    const res = await ctx.http.get('/auth/local-auth-status', 'anonymous');
    expect(res.status).toBe(200);
    expectShape(res.body, localAuthStatus);
  });
});

describe('POST /auth/local-login', () => {
  it('identifiants valides : cookies de session et forme LocalLoginResponse', async () => {
    const res = await ctx.http.post('/auth/local-login', 'anonymous', { email: EMAILS.admin, password: LOCAL_ADMIN_PASSWORD });
    expect(res.status).toBe(201);
    expectShape(res.body, localLogin);
    expect(cookiesFrom(res.headers['set-cookie'])).toContain('access_token=');
  });

  it('mauvais mot de passe : 401 unauthorized, tracé en échec', async () => {
    const res = await ctx.http.post('/auth/local-login', 'anonymous', { email: EMAILS.admin, password: 'mauvais' });
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('unauthorized');
  });

  it('compte verrouillé (10 échecs depuis la même adresse) : 401 account_locked, tracé à part', async () => {
    // Le client de test change d'adresse à chaque requête : on fixe la sienne.
    const ip = '10.200.0.1';
    const email = 'verrou@contrat.local';
    await ctx.prisma.auditLog.createMany({
      data: Array.from({ length: 10 }, () => ({ action: 'login_local_failed', userEmail: email, ipAddress: ip })),
    });

    const res = await ctx.http
      .send('post', '/auth/local-login', 'anonymous', { email, password: 'peu importe' })
      .set('X-Forwarded-For', ip);

    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
    expect(res.body.code).toBe('account_locked');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'login_local_locked', userEmail: email } })).toBe(1);
  });

  it('corps invalide : 400 du ValidationPipe', async () => {
    const res = await ctx.http.post('/auth/local-login', 'anonymous', { email: 'pas-un-email' });
    expect(res.status).toBe(400);
    expectShape(res.body, apiError);
  });
});

describe('POST /auth/refresh', () => {
  it('sans cookie de rafraîchissement : 401', async () => {
    const res = await ctx.http.post('/auth/refresh', 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });

  it('avec le cookie posé à la connexion : { ok: true }', async () => {
    const cookies = await loginAsLocalAdmin();
    const res = await ctx.http.raw().post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest').set('X-Forwarded-For', '10.251.0.1').set('Cookie', cookies);
    expect(res.status).toBe(201);
    expectShape(res.body, ok);
  });
});

describe('POST /auth/logout', () => {
  it('401 sans session', async () => {
    const res = await ctx.http.post('/auth/logout', 'anonymous');
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });

  it('avec une session : { ok: true }', async () => {
    const cookies = await loginAsLocalAdmin();
    const res = await ctx.http.raw().post('/api/auth/logout')
      .set('X-Requested-With', 'XMLHttpRequest').set('X-Forwarded-For', '10.251.0.2').set('Cookie', cookies);
    expect(res.status).toBe(201);
    expectShape(res.body, ok);
  });
});

describe('POST /auth/change-password', () => {
  it('401 sans session', async () => {
    const res = await ctx.http.post('/auth/change-password', 'anonymous', {});
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });

  it('mot de passe actuel faux : 401 (le client du front le confond avec une session expirée)', async () => {
    const res = await ctx.http.post('/auth/change-password', 'admin', {
      currentPassword: 'faux',
      newPassword: 'Nouveau-Mot-De-Passe-2026!',
    });
    expect(res.status).toBe(401);
    expectShape(res.body, apiError);
  });

  it('changement réussi : { ok: true } et nouveaux cookies', async () => {
    await waitForNextSecond();
    const cookies = await loginAsLocalAdmin();
    const res = await ctx.http.raw().post('/api/auth/change-password')
      .set('X-Requested-With', 'XMLHttpRequest').set('X-Forwarded-For', '10.251.0.3').set('Cookie', cookies)
      .send({ currentPassword: LOCAL_ADMIN_PASSWORD, newPassword: 'Nouveau-Mot-De-Passe-2026!' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectShape(res.body, ok);
    expect(cookiesFrom(res.headers['set-cookie'])).toContain('access_token=');
  });
});
