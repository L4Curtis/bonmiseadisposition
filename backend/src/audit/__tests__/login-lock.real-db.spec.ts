/**
 * Verrou de connexion contre une VRAIE base : le déverrouillage n'efface
 * aucune ligne du journal, il pose un marqueur `user_unlocked` que la
 * requête JSON (`details.targetEmail`) retrouve.
 *
 *   cd backend && RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/audit/__tests__/login-lock.real-db.spec.ts
 */
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit.service';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { lockWindowStart, LOGIN_LOCK_WINDOW_MS } from '../login-lock';
import { localLogin } from '../../auth/local-login';
import { AccountLockedException } from '../../auth/exceptions';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

const EMAIL = 'zz-login-lock@test.local';
const OTHER_EMAIL = 'zz-login-lock-autre@test.local';
const IP_EMAIL_PREFIX = 'zz-login-lock-poste-';
const ATTACKER_IP = '10.9.9.9';

describeDb('Verrou de connexion : marqueur de déverrouillage (base réelle)', () => {
  let prisma: PrismaService;
  let audit: AuditService;

  async function cleanup(): Promise<void> {
    await prisma.auditLog.deleteMany({ where: { userEmail: { in: [EMAIL, OTHER_EMAIL] } } });
    await prisma.auditLog.deleteMany({ where: { userEmail: { startsWith: IP_EMAIL_PREFIX } } });
    await prisma.auditLog.deleteMany({
      where: { action: 'user_unlocked', details: { path: ['targetEmail'], string_starts_with: 'zz-login-lock' } },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    audit = new AuditService(prisma);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('repart du dernier déverrouillage de CE compte, sans effacer les échecs', async () => {
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      await audit.record('login_local_failed', { actorEmail: EMAIL, ip: '10.0.0.1' });
    }
    expect(await lockWindowStart(prisma, EMAIL, now)).toEqual(new Date(now.getTime() - LOGIN_LOCK_WINDOW_MS));

    await audit.record('user_unlocked', { actorEmail: 'admin@test.local', details: { targetEmail: OTHER_EMAIL } });
    expect(await lockWindowStart(prisma, EMAIL, now)).toEqual(new Date(now.getTime() - LOGIN_LOCK_WINDOW_MS));

    await audit.record('user_unlocked', { actorEmail: 'admin@test.local', details: { targetEmail: EMAIL } });
    const marker = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'user_unlocked', details: { path: ['targetEmail'], equals: EMAIL } },
    });
    const start = await lockWindowStart(prisma, EMAIL, new Date());

    expect(start).toEqual(marker.createdAt);
    expect(await prisma.auditLog.count({ where: { userEmail: EMAIL, action: 'login_local_failed' } })).toBe(3);
    expect(
      await prisma.auditLog.count({ where: { userEmail: EMAIL, action: 'login_local_failed', createdAt: { gte: start } } }),
    ).toBe(0);
  });

  /** Tentative de connexion : la raison du refus (verrou ou identifiants). */
  async function attempt(email: string, ip: string): Promise<string> {
    const deps = { prisma, logger: new Logger('login-lock.real-db'), createTokens: () => Promise.reject(new Error('inattendu')) };
    const error = await localLogin(deps, email, 'mauvais-mot-de-passe', ip).catch((e: unknown) => e);
    if (error instanceof AccountLockedException) return 'verrouillé : ' + (error.getResponse() as { message: string }).message;
    if (error instanceof UnauthorizedException) return 'identifiants';
    throw error;
  }

  /**
   * Les échecs sont horodatés par Prisma (horloge du poste de test), le
   * déverrouillage du guide par `now()` (horloge du serveur PostgreSQL). Sous
   * Docker Desktop, la seconde peut retarder de quelques millisecondes sur la
   * première : on attend qu'elle ait dépassé le dernier échec, comme lorsqu'un
   * administrateur tape la commande, bien après le verrouillage.
   */
  async function waitForDatabaseClockAfterLastFailure(): Promise<void> {
    const last = await prisma.auditLog.findFirstOrThrow({
      where: { userEmail: EMAIL, action: 'login_local_failed' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const deadline = Date.now() + 5_000;
    for (;;) {
      const [row] = await prisma.$queryRaw<Array<{ after: boolean }>>`
        SELECT (now() AT TIME ZONE 'UTC') > ${last.createdAt}::timestamp AS after`;
      if (row?.after) return;
      if (Date.now() > deadline) throw new Error('Horloge PostgreSQL toujours en retard sur le dernier échec après 5 s');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it('10 échecs verrouillent le compte ; le déverrouillage manuel du guide d’exploitation le lève sans rien effacer', async () => {
    await cleanup();
    for (let i = 0; i < 10; i++) await audit.record('login_local_failed', { actorEmail: EMAIL, ip: ATTACKER_IP });
    expect(await attempt(EMAIL, ATTACKER_IP)).toMatch(/^verrouillé : Compte temporairement verrouillé/);
    await waitForDatabaseClockAfterLastFailure();

    // Commande exacte de deploy/README.md (« Compte admin@local verrouillé »), adresse du compte près.
    await prisma.$executeRawUnsafe(
      `INSERT INTO audit_logs (id, action, details, created_at) VALUES (gen_random_uuid()::text, 'user_unlocked', '{"targetEmail": "${EMAIL}"}', now() AT TIME ZONE 'UTC');`,
    );

    expect(await attempt(EMAIL, ATTACKER_IP)).toBe('identifiants');
    expect(await prisma.auditLog.count({ where: { userEmail: EMAIL, action: 'login_local_failed' } })).toBe(10);
  });

  it('le déverrouillage d’un compte ne lève pas le verrou du poste (30 échecs, tous comptes confondus)', async () => {
    await cleanup();
    for (let i = 0; i < 30; i++) {
      await audit.record('login_local_failed', { actorEmail: `${IP_EMAIL_PREFIX}${i % 6}@test.local`, ip: ATTACKER_IP });
    }
    await audit.record('user_unlocked', { actorEmail: 'admin@test.local', details: { targetEmail: EMAIL } });

    expect(await attempt(EMAIL, ATTACKER_IP)).toBe('verrouillé : Trop de tentatives depuis votre adresse. Réessayez dans 30 minutes.');
    expect(await attempt(EMAIL, '10.9.9.10')).toBe('identifiants');
  });
});
