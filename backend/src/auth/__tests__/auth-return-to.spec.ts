/**
 * Retour à la page demandée après une connexion Microsoft (cookie
 * `auth_return_to`), de bout en bout : vraie application Nest, vrais cookies,
 * vraies redirections. Seuls l'échange avec Microsoft (AuthService) et la base
 * sont remplacés.
 *
 * Aller : GET /auth/login?returnTo=… pose le cookie (chemin interne seulement).
 * Retour : GET /auth/callback le lit, l'efface quelle que soit l'issue, et ne
 * redirige vers lui que s'il est toujours sûr (un cookie peut être forgé).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import cookieParser from 'cookie-parser';
import { AuthController, isSafeReturnTo } from '../auth.controller';
import { AuthService } from '../auth.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserThrottlerGuard } from '../guards/user-throttler.guard';

const FRONT = 'https://bons.example.test';
const STATE = 'etat-oauth';

const authService = {
  getLoginUrl: vi.fn(async () => ({ url: 'https://login.microsoftonline.com/autorisation', codeVerifier: 'pkce' })),
  handleCallback: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u-1', email: 'u@x.fr' } })),
  setAuthCookies: vi.fn(),
};

describe('isSafeReturnTo — chemin interne seulement', () => {
  it.each([
    ['/bons/42?onglet=pdf#haut'],
    ['/signer/abc'],
  ])('accepte %s', (valeur) => {
    expect(isSafeReturnTo(valeur, FRONT)).toBe(true);
  });

  it.each([
    ['https://evil.test/'],
    ['//evil.test'],
    ['///evil.test'],
    ['/\\evil.test'],
    ['/\u0000x'],
    ['/\u007fx'],
    ['/\r\nSet-Cookie:x=1'],
    ['javascript:alert(1)'],
    ['bons'],
    [''],
    [`/${'a'.repeat(2048)}`],
    [['/a', '/b']],
    [{ chemin: '/a' }],
    [undefined],
  ])('refuse %j', (valeur) => {
    expect(isSafeReturnTo(valeur, FRONT)).toBe(false);
  });
});

describe('Cookie auth_return_to — aller-retour HTTP réel', () => {
  let app: INestApplication;
  let baseUrl: string;
  const ancienFront = process.env.FRONTEND_URL;

  beforeAll(async () => {
    process.env.FRONTEND_URL = FRONT;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AppConfigService, useValue: { get: vi.fn() } },
        { provide: PrismaService, useValue: { auditLog: { create: vi.fn(async () => ({})) } } },
      ],
    })
      .overrideGuard(UserThrottlerGuard).useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api/auth`;
  });

  afterAll(async () => {
    await app.close();
    process.env.FRONTEND_URL = ancienFront;
  });

  const appel = (path: string, cookie?: string): Promise<Response> =>
    fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });

  const cookieRetour = (res: Response): string | undefined =>
    res.headers.getSetCookie().find((c) => c.startsWith('auth_return_to='));

  it('aller : pose un cookie httpOnly, SameSite=Lax, de 10 minutes au plus, pour tout le site', async () => {
    const res = await appel(`/login?returnTo=${encodeURIComponent('/bons/42?onglet=pdf')}`);
    expect(res.status).toBe(302);
    const cookie = cookieRetour(res) ?? '';
    expect(cookie).toMatch(/^auth_return_to=%2Fbons%2F42%3Fonglet%3Dpdf;/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Max-Age=600;/);
    expect(cookie).toMatch(/; Path=\//);
  });

  it.each([
    ['https://evil.test/'],
    ['//evil.test'],
    ['/\\evil.test'],
  ])('aller : %s ne pose aucune destination et efface celle d’une tentative précédente', async (valeur) => {
    const res = await appel(`/login?returnTo=${encodeURIComponent(valeur)}`);
    expect(res.status).toBe(302);
    expect(cookieRetour(res)).toMatch(/^auth_return_to=; .*Expires=Thu, 01 Jan 1970/);
  });

  it('aller : un returnTo répété (tableau) est refusé sans casser la connexion', async () => {
    const res = await appel('/login?returnTo=/a&returnTo=/b');
    expect(res.headers.get('location')).toBe('https://login.microsoftonline.com/autorisation');
    expect(cookieRetour(res)).toMatch(/^auth_return_to=;/);
  });

  it('retour : redirige vers la page demandée et efface le cookie', async () => {
    const res = await appel(`/callback?code=c&state=${STATE}`, `oauth_state=${STATE}; auth_return_to=%2Fbons%2F42`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${FRONT}/bons/42`);
    expect(cookieRetour(res)).toMatch(/^auth_return_to=; .*Expires=Thu, 01 Jan 1970/);
  });

  it.each([
    ['//evil.test'],
    ['https://evil.test/'],
    ['/\\evil.test'],
    // Retour chariot et saut de ligne réels, une fois le cookie décodé :
    // tentative d'injection d'en-tête dans la redirection.
    ['/\r\nSet-Cookie:x=1'],
  ])('retour : un cookie forgé (%s) ramène à l’accueil du front', async (valeur) => {
    const res = await appel(`/callback?code=c&state=${STATE}`, `oauth_state=${STATE}; auth_return_to=${encodeURIComponent(valeur)}`);
    expect(res.headers.get('location')).toBe(`${FRONT}/`);
  });

  it('retour : le cookie est effacé aussi quand la connexion échoue (état invalide, erreur Microsoft)', async () => {
    for (const path of [`/callback?code=c&state=autre`, '/callback?error=access_denied']) {
      const res = await appel(path, `oauth_state=${STATE}; auth_return_to=%2Fbons%2F42`);
      expect(res.headers.get('location')).toMatch(new RegExp(`^${FRONT}/login\\?error=`));
      expect(cookieRetour(res)).toMatch(/^auth_return_to=; .*Expires=Thu, 01 Jan 1970/);
    }
  });
});
