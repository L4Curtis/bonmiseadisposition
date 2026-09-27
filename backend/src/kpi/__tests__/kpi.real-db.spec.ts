/**
 * Indicateurs contre une VRAIE base PostgreSQL : « le chiffre de la tuile est
 * le nombre de lignes de la liste qu'elle ouvre », et les définitions du
 * lexique (équipements et non déclarations, emails `skipped` exclus, remises
 * et clôtures sans signature séparées, contestations Fondées / Non retenues).
 *
 * Les invariants (tuile = liste, dernier point de la courbe = carte) valent
 * sur n'importe quelle base : lancez-les aussi sur une copie amorcée avec du
 * volume. Les définitions sont vérifiées sur des données préfixées TEST_PREFIX,
 * isolées par leur filiale et supprimées à la fin.
 *
 *   cd backend && RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/kpi/__tests__/kpi.real-db.spec.ts
 */
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../../reporting/inventory.service';
import { buildBonWhere } from '../../bons/queries/bon-where';
import { buildAwaitingSignatureWhere, buildExpiredLinkWhere } from '../../common/bon-predicates';
import { addDaysToIsoDate, todayInParis } from '../../common/dates/paris';
import { KpiParcService } from '../kpi-parc.service';
import { KpiDelaisService } from '../kpi-delais.service';
import { KpiIncidentsService } from '../kpi-incidents.service';
import { KpiTodayService } from '../kpi-today.service';
import { resolvePeriod } from '../kpi-period';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

const TEST_PREFIX = 'zz-kpi-2d';
const THRESHOLD_DAYS = 7;
const configStub = { getSignatureOverdueDays: async () => THRESHOLD_DAYS } as never;

describeDb('Indicateurs (base réelle)', () => {
  let prisma: PrismaService;
  let filialeId: string;

  async function cleanup(): Promise<void> {
    const onBon = { bon: { reference: { startsWith: TEST_PREFIX } } };
    await prisma.notificationLog.deleteMany({ where: onBon });
    await prisma.auditLog.deleteMany({ where: onBon });
    await prisma.contestation.deleteMany({ where: onBon });
    await prisma.bon.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await prisma.filiale.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  }

  async function seedDefinitions(): Promise<void> {
    const filiale = await prisma.filiale.create({ data: { name: `${TEST_PREFIX}-f`, displayName: `${TEST_PREFIX} F` } });
    filialeId = filiale.id;
    const user = await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-u`, email: `${TEST_PREFIX}-u@test.local`, displayName: 'Léa', role: 'collaborator' },
    });
    const bon = await prisma.bon.create({
      data: {
        reference: `${TEST_PREFIX}-1`, filialeId, collaborateurId: user.id, createdById: user.id, civilite: 'mme',
        status: 'active', dateMiseDisposition: new Date(),
      },
    });
    const at = new Date();
    await prisma.auditLog.createMany({
      data: [
        { bonId: bon.id, action: 'declare_not_returned', details: { equipmentIds: ['a', 'b', 'c'] }, createdAt: at },
        { bonId: bon.id, action: 'declare_not_returned_partial', details: { remaining: 2 }, createdAt: at },
        { bonId: bon.id, action: 'mark_found', details: { equipmentIds: ['a'] }, createdAt: at },
        { bonId: bon.id, action: 'bon_closed_unilateral', details: { to: 'active', reason: 'Tablette en panne' }, createdAt: at },
        { bonId: bon.id, action: 'bon_closed_unilateral', details: { to: 'archived', reason: 'Parti' }, createdAt: at },
      ],
    });
    await prisma.notificationLog.createMany({
      data: [
        { bonId: bon.id, recipientEmail: 'lea@test.local', type: 'reminder', status: 'failed', sentAt: at },
        { bonId: bon.id, recipientEmail: 'lea@test.local', type: 'reminder', status: 'bounced', sentAt: at },
        { bonId: bon.id, recipientEmail: '', type: 'reminder', status: 'skipped', sentAt: at },
        { bonId: bon.id, recipientEmail: '', type: 'reminder', status: 'failed', sentAt: at },
      ],
    });
    await prisma.contestation.createMany({
      data: [
        { bonId: bon.id, userId: user.id, message: 'a', status: 'open' },
        { bonId: bon.id, userId: user.id, message: 'b', status: 'resolved', outcome: 'founded', resolvedAt: at },
        { bonId: bon.id, userId: user.id, message: 'c', status: 'rejected', outcome: 'not_retained', resolvedAt: at },
      ],
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await cleanup();
    await seedDefinitions();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('accueil : chaque tuile = la liste qu’elle ouvre', () => {
    it('signatures attendues, signature en retard, liens expirés', async () => {
      const now = new Date();
      const today = await new KpiTodayService(prisma, configStub).getToday(now);
      expect(today.awaitingSignatures).toBe(await prisma.bon.count({ where: buildAwaitingSignatureWhere() }));
      expect(today.overdueSignatures).toBe(
        await prisma.bon.count({ where: buildBonWhere({ overdue: true }, THRESHOLD_DAYS) }),
      );
      expect(today.expiredLinks).toBe(await prisma.bon.count({ where: buildExpiredLinkWhere(now) }));
      expect(today.toDo.overdueSignatures.total).toBe(today.overdueSignatures);
    });

    it('retour en retard et départs = inventaire filtré', async () => {
      const today = await new KpiTodayService(prisma, configStub).getToday();
      const inventory = new InventoryService(prisma);
      const overdueList = await inventory.getInventory({ overdue: true, page: 1, limit: 1 } as never);
      const departures = await inventory.getInventoryByCollaborateur({ compte: 'inactif', page: 1, limit: 1 } as never);
      expect(today.overdueReturns.equipments).toBe(overdueList.total);
      expect(today.departures.collaborateurs).toBe(departures.total);
    });

    it('états par statut et contestations à traiter', async () => {
      const today = await new KpiTodayService(prisma, configStub).getToday();
      expect(today.activeBons).toBe(await prisma.bon.count({ where: buildBonWhere({ status: ['active'] }) }));
      expect(today.contestationsToProcess).toBe(
        await prisma.contestation.count({ where: { status: { in: ['open', 'in_review'] } } }),
      );
      expect(today.toDo.contestations.rows.length).toBeLessThanOrEqual(5);
    });
  });

  it('délais : les étapes en attente totalisent les tuiles de l’accueil', async () => {
    const now = new Date();
    const delais = await new KpiDelaisService(prisma, configStub).getDelais(resolvePeriod({}), undefined, now);
    const today = await new KpiTodayService(prisma, configStub).getToday(now);
    expect(delais.waiting.steps.reduce((sum, s) => sum + s.count, 0)).toBe(today.awaitingSignatures);
    expect(delais.waiting.overdueTotal).toBe(today.overdueSignatures);
  });

  it.each([29, 364])('parc (%i jours) : le dernier point de la courbe égale la carte', async (days) => {
    const to = todayInParis();
    const from = addDaysToIsoDate(to, -days);
    const parc = await new KpiParcService(prisma).getParc(resolvePeriod({ from, to }));
    expect(parc.loaned.series.at(-1)?.count).toBe(parc.loaned.total);
  });

  describe('définitions (filiale de test)', () => {
    it('incidents : équipements, remises et clôtures séparées, emails sans « skipped »', async () => {
      const incidents = await new KpiIncidentsService(prisma).getIncidents(resolvePeriod({}), filialeId);
      expect(incidents.notReturned.declared.current).toBe(3);
      expect(incidents.notReturned.found.current).toBe(1);
      expect(incidents.withoutSignature.handovers.current).toBe(1);
      expect(incidents.withoutSignature.closures.current).toBe(1);
      expect(incidents.withoutSignature.handoverReasons).toEqual([{ reason: 'Tablette en panne', count: 1 }]);
      expect(incidents.failedEmails.count.current).toBe(2);
    });

    it('contestations : reçues, à traiter, Fondées et Non retenues', async () => {
      const { contestations } = await new KpiIncidentsService(prisma).getIncidents(resolvePeriod({}), filialeId);
      expect(contestations.received.current).toBe(3);
      expect(contestations.toProcess).toBe(1);
      expect(contestations.decided.current).toBe(2);
      expect(contestations.founded.current).toBe(1);
      expect(contestations.notRetained.current).toBe(1);
    });
  });
});
