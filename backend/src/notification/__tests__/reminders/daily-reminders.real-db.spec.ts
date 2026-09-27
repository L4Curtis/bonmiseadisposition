/**
 * Rappels de signature contre une VRAIE base PostgreSQL (R-033, R-004, R-034) :
 * trois rappels au plus PAR DOCUMENT, comptés depuis la demande de ce document
 * (`Bon.awaitingSince`), et jamais de rappel ni de ligne quotidienne pour un
 * compte désactivé, un collaborateur sans adresse ou une adresse invalide.
 *
 *   cd backend && RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/notification/__tests__/reminders/daily-reminders.real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée.
 *
 * La base visée peut ne pas être jetable : chaque test s'exécute dans une
 * transaction ANNULÉE à la fin (rien n'est écrit), et la tâche ne voit que
 * les bons du test (`scope`). Une contre-épreuve vérifie qu'un bon étranger
 * au test, pourtant éligible, n'est pas touché.
 */
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { Prisma, SignatureType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { runDailyReminders } from '../../reminders/daily-reminders';

const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;
const TEST_PREFIX = 'zz-rappels-2b';
const DAY = 24 * 60 * 60 * 1000;

/** Levée pour annuler la transaction d'un test une fois ses vérifications faites. */
class Rollback extends Error {}

type Tx = Prisma.TransactionClient;

describeDb('runDailyReminders — base réelle (transaction annulée)', () => {
  let prisma: PrismaService;
  const suffix = randomUUID().slice(0, 8);
  const scope: Prisma.BonWhereInput = { reference: { startsWith: `${TEST_PREFIX}-` } };
  const config: Record<string, string> = { 'rappels.enabled': 'true', 'rappels.delay_1': '3', 'rappels.delay_2': '7', 'rappels.delay_3': '14' };

  interface Fixture {
    tx: Tx;
    filialeId: string;
    techId: string;
    sent: Array<{ to: string; subject: string }>;
  }

  const deps = (f: Fixture, withScope = true) => ({
    configService: { get: async (c: string, k: string) => config[`${c}.${k}`] ?? null } as never,
    prisma: f.tx as unknown as PrismaService,
    templatesService: { renderTemplate: async (_id: string, vars: Record<string, string>) => JSON.stringify(vars) } as never,
    logger: new Logger('test-rappels'),
    getAppUrl: async () => 'https://bons.test',
    getTransporter: async () => ({}) as never,
    sendEmail: async (to: string, subject: string) => {
      f.sent.push({ to, subject });
      return { ok: true };
    },
    ...(withScope ? { scope } : {}),
  });

  /** Exécute `body` dans une transaction toujours annulée. */
  async function inRollback(body: (f: Fixture) => Promise<void>): Promise<void> {
    await prisma
      .$transaction(
        async (tx) => {
          const filiale = await tx.filiale.create({ data: { name: `${TEST_PREFIX}-${suffix}`, displayName: 'Filiale test rappels' } });
          const tech = await tx.user.create({
            data: { samAccountName: `${TEST_PREFIX}-tech-${suffix}`, displayName: 'Tech', email: `${TEST_PREFIX}-tech-${suffix}@groupe-livio.fr`, role: 'technician' },
          });
          await body({ tx, filialeId: filiale.id, techId: tech.id, sent: [] });
          throw new Rollback();
        },
        { timeout: 60_000 },
      )
      .catch((err: unknown) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  async function makeBon(
    f: Fixture,
    key: string,
    opts: { active?: boolean; email?: string | null; document: SignatureType; awaitingDaysAgo: number; reference?: string },
  ) {
    const user = await f.tx.user.create({
      data: {
        samAccountName: `${TEST_PREFIX}-${key}-${suffix}`,
        displayName: `Test ${key}`,
        email: opts.email === undefined ? `${TEST_PREFIX}-${key}-${suffix}@groupe-livio.fr` : opts.email,
        active: opts.active ?? true,
      },
    });
    const status = opts.document === 'mise_disposition' ? 'sent_mise_dispo' : opts.document === 'restitution' ? 'sent_restitution' : 'partially_returned';
    const bon = await f.tx.bon.create({
      data: {
        reference: opts.reference ?? `${TEST_PREFIX}-${key}-${suffix}`,
        filialeId: f.filialeId,
        collaborateurId: user.id,
        collaborateurEmail: user.email,
        createdById: f.techId,
        civilite: 'mme',
        status,
        dateMiseDisposition: new Date('2026-09-01'),
        awaitingSince: new Date(Date.now() - opts.awaitingDaysAgo * DAY),
      },
    });
    await f.tx.signature.create({
      data: { bonId: bon.id, type: opts.document, token: randomUUID(), tokenExpiresAt: new Date(Date.now() + 5 * DAY) },
    });
    return bon;
  }

  async function logReminders(f: Fixture, bonId: string, document: SignatureType, count: number, daysAgo: number) {
    for (let i = 0; i < count; i++) {
      await f.tx.notificationLog.create({
        data: {
          bonId, recipientEmail: 'x@y.fr', type: 'reminder', status: 'sent', reminderNumber: i + 1,
          documentType: document, sentAt: new Date(Date.now() - daysAgo * DAY),
        },
      });
    }
  }

  const reminderLogs = (f: Fixture, bonId: string) =>
    f.tx.notificationLog.findMany({ where: { bonId, type: 'reminder' }, orderBy: { sentAt: 'asc' } });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('compte par document : trois rappels de remise n’empêchent pas le rappel de restitution', async () => {
    await inRollback(async (f) => {
      const bon = await makeBon(f, 'restitution', { document: 'restitution', awaitingDaysAgo: 4 });
      await logReminders(f, bon.id, 'mise_disposition', 3, 30); // la remise, avant la nouvelle demande
      const done = await makeBon(f, 'epuise', { document: 'restitution', awaitingDaysAgo: 20 });
      await logReminders(f, done.id, 'restitution', 3, 1);

      await runDailyReminders(deps(f));

      const logs = await reminderLogs(f, bon.id);
      expect(logs[logs.length - 1]).toMatchObject({ status: 'sent', documentType: 'restitution', reminderNumber: 1 });
      expect(await reminderLogs(f, done.id)).toHaveLength(3);
      expect(f.sent.some((m) => m.subject.includes(done.reference))).toBe(false);
    });
  });

  it('collaborateur sans adresse ou compte désactivé : une seule ligne « non envoyé », aucun email, aucun lien renouvelé', async () => {
    await inRollback(async (f) => {
      const noEmail = await makeBon(f, 'sans-adresse', { document: 'mise_disposition', awaitingDaysAgo: 10, email: null });
      const gone = await makeBon(f, 'parti', { document: 'pv_cloture', awaitingDaysAgo: 10, active: false });

      await runDailyReminders(deps(f));
      await runDailyReminders(deps(f)); // le lendemain

      for (const bon of [noEmail, gone]) {
        const logs = await reminderLogs(f, bon.id);
        expect(logs).toHaveLength(1);
        expect(logs[0].status).toBe('skipped');
        expect(await f.tx.signature.count({ where: { bonId: bon.id } })).toBe(1);
      }
      expect(f.sent.some((m) => m.subject.includes(noEmail.reference) || m.subject.includes(gone.reference))).toBe(false);
    });
  });

  it('adresse invalide : un seul échec « adresse à corriger » par document, pas un par jour', async () => {
    await inRollback(async (f) => {
      const invalid = await makeBon(f, 'adresse-invalide', { document: 'restitution', awaitingDaysAgo: 10, email: 'pas-une-adresse' });

      await runDailyReminders(deps(f));
      await runDailyReminders(deps(f)); // le lendemain

      const logs = await reminderLogs(f, invalid.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ status: 'failed', documentType: 'restitution' });
      expect(f.sent.some((m) => m.subject.includes(invalid.reference))).toBe(false);
    });
  });

  it('contre-épreuve : un bon étranger au test, pourtant éligible, n’est pas touché', async () => {
    await inRollback(async (f) => {
      const foreign = await makeBon(f, 'etranger', {
        document: 'mise_disposition', awaitingDaysAgo: 10, reference: `BON-ETRANGER-${suffix}`,
      });
      const [linkBefore] = await f.tx.signature.findMany({ where: { bonId: foreign.id } });

      await runDailyReminders(deps(f));

      expect(await reminderLogs(f, foreign.id)).toHaveLength(0);
      const links = await f.tx.signature.findMany({ where: { bonId: foreign.id } });
      expect(links).toEqual([linkBefore]);
      expect(f.sent.some((m) => m.subject.includes(foreign.reference))).toBe(false);

      // Témoin : sans restriction, ce même bon aurait reçu son rappel.
      await runDailyReminders(deps(f, false));
      expect(f.sent.some((m) => m.subject.includes(foreign.reference))).toBe(true);
    });
  });

  it('rien n’est resté en base après les tests (transactions annulées)', async () => {
    expect(await prisma.bon.count({ where: { reference: { contains: suffix } } })).toBe(0);
    expect(await prisma.user.count({ where: { samAccountName: { startsWith: `${TEST_PREFIX}-` } } })).toBe(0);
  });
});
