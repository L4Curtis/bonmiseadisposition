import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { getRefreshTokenTracker, UserThrottlerGuard } from '../user-throttler.guard';
import { AuthService } from '../../auth.service';

const JWT_SECRET = 'test-jwt-secret-for-unit-tests-0123456789abcdef';

describe('getRefreshTokenTracker', () => {
  const jwtService = new JwtService({});

  function sign(payload: Record<string, unknown>, secret = JWT_SECRET): string {
    return jwtService.sign(payload, { secret, expiresIn: '8h' });
  }

  it('tracks by user id (sub) for a signature-valid refresh token', () => {
    const token = sign({ sub: 'user-123', type: 'refresh' });
    const req = { cookies: { refresh_token: token }, ip: '10.0.0.1' };

    expect(getRefreshTokenTracker(req, jwtService, JWT_SECRET)).toBe('user:user-123');
  });

  it('falls back to IP for a forged token (wrong signature) — LOT C bug #1 relecture', () => {
    // Signed with a DIFFERENT secret — jwt.decode() would have accepted this
    // and returned an attacker-chosen sub; verify() must reject it.
    const forged = sign({ sub: 'attacker-chosen-sub', type: 'refresh' }, 'a-completely-different-secret-0123456789');
    const req = { cookies: { refresh_token: forged }, ip: '10.0.0.1' };

    expect(getRefreshTokenTracker(req, jwtService, JWT_SECRET)).toBe('ip:10.0.0.1');
  });

  it('falls back to IP when the token type is not "refresh" (e.g. an access token)', () => {
    const accessToken = sign({ sub: 'user-123', email: 'a@b.fr', role: 'admin' });
    const req = { cookies: { refresh_token: accessToken }, ip: '10.0.0.1' };

    expect(getRefreshTokenTracker(req, jwtService, JWT_SECRET)).toBe('ip:10.0.0.1');
  });

  it('falls back to IP when there is no refresh_token cookie', () => {
    const req = { cookies: {}, ip: '10.0.0.1' };

    expect(getRefreshTokenTracker(req, jwtService, JWT_SECRET)).toBe('ip:10.0.0.1');
  });

  it('falls back to IP for a garbage/malformed token', () => {
    const req = { cookies: { refresh_token: 'not-a-jwt' }, ip: '10.0.0.1' };

    expect(getRefreshTokenTracker(req, jwtService, JWT_SECRET)).toBe('ip:10.0.0.1');
  });

  it('uses "unknown" when neither a token nor an IP is available', () => {
    const req = { cookies: {}, ip: undefined };

    expect(getRefreshTokenTracker(req, jwtService, JWT_SECRET)).toBe('ip:unknown');
  });
});

describe('UserThrottlerGuard.canActivate', () => {
  let guard: UserThrottlerGuard;
  let jwtService: JwtService;
  let storage: ThrottlerStorageService;

  function makeContext(req: { cookies: Record<string, string>; ip: string }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ header: vi.fn() }),
      }),
      getClass: () => ({ name: 'AuthControllerTest' }),
      getHandler: () => ({ name: 'refreshTest' }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    jwtService = new JwtService({});
    const authService = { getJwtSecret: () => JWT_SECRET } as unknown as AuthService;
    storage = new ThrottlerStorageService();

    guard = new UserThrottlerGuard([{ name: 'default', ttl: 60000, limit: 60 }], storage, undefined as never, jwtService, authService);
    // onModuleInit() populates this.throttlers/this.commonOptions, normally
    // triggered by Nest — required here since the guard is constructed by hand.
    await guard.onModuleInit();
  });

  afterEach(() => {
    // ThrottlerStorageService schedules a real setTimeout per hit to decrement
    // its counter — clear them so the test process can exit cleanly.
    storage.onApplicationShutdown();
  });

  it('allows up to the per-user limit (20/min) then throws 429 on the 21st request with the same valid token', async () => {
    const token = jwtService.sign({ sub: 'user-abc', type: 'refresh' }, { secret: JWT_SECRET, expiresIn: '8h' });
    const context = makeContext({ cookies: { refresh_token: token }, ip: '203.0.113.9' });

    for (let i = 0; i < 20; i++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);
  });
});
