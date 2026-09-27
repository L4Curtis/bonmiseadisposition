/**
 * « Tuile = liste » contre une VRAIE base PostgreSQL : chaque carte du tableau
 * de bord qui ouvre une liste compte exactement les lignes de cette liste —
 * les MÊMES lignes (identifiants comparés), pour la période et la filiale
 * choisies.
 *
 * - Cartes d'équipements (Parc, Incidents) → inventaire filtré
 *   (`situation=non_restitue`, `horsCatalogue`, `sansNumeroSerie`) : le
 *   fragment SQL de la carte et le `where` Prisma de la liste désignent les
 *   mêmes équipements.
 * - Cartes de bons et d'événements sur la période (Délais, Incidents) → liste
 *   du chiffre (`GET /kpi/liste`), réservée à l'IT.
 *
 * Deux filiales : ce qui arrive dans l'autre ne compte jamais ; des éléments
 * vieux de soixante jours, hors période, non plus. Données préfixées
 * TEST_PREFIX, supprimées à la fin.
 *
 *   cd backend && RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/kpi/__tests__/kpi-lists.real-db.spec.ts
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../../reporting/inventory.service';
import {
  missingSerialSql,
  notReturnedEquipmentSql,
  offCatalogSql,
  parcEquipmentSql,
} from '../../common/bon-predicates';
import { addDaysToIsoDate, todayInParis } from '../../common/dates/paris';
import { KpiParcService } from '../kpi-parc.service';
import { KpiDelaisService } from '../kpi-delais.service';
import { KpiIncidentsService } from '../kpi-incidents.service';
import { KpiListService } from '../lists/kpi-list.service';
import { KPI_LIST_KEYS, type KpiListKey } from '../lists/kpi-list-sources';
import { resolvePeriod } from '../kpi-period';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

const TEST_PREFIX = 'zz-kpi-r4';
const configStub = { getSignatureOverdueDays: async () => 7 } as never;
const DAY_MS = 86_400_000;
const sorted = (ids: string[]): string[] => [...ids].sort();

describeDb('Tuile = liste (base réelle)', () => {
  let prisma: PrismaService;
  let filialeId: string;
  /** Période de sept jours finissant aujourd'hui : les éléments du jour y sont, ceux d'il y a 60 jours non. */
  const range = { from: addDaysToIsoDate(todayInParis(), -6), to: todayInParis() };
  const period = resolvePeriod(range);
  /** Identifiants attendus, relevés à la création. */
  const expected = {} as Record<KpiListKey | 'notReturned' | 'offCatalog' | 'missingSerial', string[]>;

  async function cleanup(): Promise<void> {
    const onBon = { bon: { reference: { startsWith: TEST_PREFIX } } };
    await prisma.notificationLog.deleteMany({ where: onBon });
    await prisma.auditLog.deleteMany({ where: onBon });
    await prisma.contestation.deleteMany({ where: onBon });
    await prisma.bon.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } });
    await prisma.equipmentCatalog.deleteMany({ where: { brand: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await prisma.filiale.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  }

  /** Une filiale avec son collaborateur, et une fabrique de bons. */
  async function makeFiliale(suffix: string) {
    const filiale = await prisma.filiale.create({ data: { name: `${TEST_PREFIX}-${suffix}`, displayName: `${TEST_PREFIX} ${suffix}` } });
    const user = await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-${suffix}`, email: `${TEST_PREFIX}-${suffix}@test.local`, displayName: `Léa ${suffix}`, role: 'collaborator' },
    });
    const bon = async (n: string, status: string, extra: Record<string, unknown> = {}) => (await prisma.bon.create({
      data: {
        reference: `${TEST_PREFIX}-${suffix}-${n}`, filialeId: filiale.id, collaborateurId: user.id, createdById: user.id,
        civilite: 'mme', status: status as never, dateMiseDisposition: new Date(), ...extra,
      },
    })).id;
    return { filialeId: filiale.id, userId: user.id, bon };
  }

  const equipment = async (data: Prisma.BonEquipmentUncheckedCreateInput) => (await prisma.bonEquipment.create({ data })).id;
  const audit = async (bonId: string, action: string, createdAt: Date, details?: Prisma.InputJsonValue) =>
    (await prisma.auditLog.create({ data: { bonId, action, createdAt, details } })).id;
  const email = async (bonId: string, status: string, sentAt: Date, recipientEmail = 'lea@test.local') =>
    (await prisma.notificationLog.create({ data: { bonId, recipientEmail, type: 'reminder', status: status as never, sentAt } })).id;
  const contestation = async (bonId: string, userId: string, status: string, createdAt: Date) =>
    (await prisma.contestation.create({ data: { bonId, userId, message: 'm', status: status as never, createdAt } })).id;

  /** Filiale observée : le jeu de la carte et de sa liste. */
  async function seedMain(catalogId: string): Promise<void> {
    const main = await makeFiliale('f');
    filialeId = main.filialeId;
    const now = new Date();
    const old = new Date(Date.now() - 60 * DAY_MS);
    // Retour prévu il y a dix jours : ses équipements du parc sont en retard.
    const active = await main.bon('1', 'active', { dateRestitution: new Date(Date.now() - 10 * DAY_MS) });
    const archived = await main.bon('2', 'archived', { archivedAt: now });
    const cancelled = await main.bon('3', 'cancelled', { cancelledAt: now, cancellationReason: 'Doublon' });
    const partial = await main.bon('4', 'partially_returned');
    const oldBon = await main.bon('5', 'active', { createdAt: old });

    const cable = await equipment({ bonId: active, customLabel: 'Câble maison', serialNumber: null });
    await equipment({ bonId: active, catalogItemId: catalogId, serialNumber: 'SN-R4-1' });
    await equipment({ bonId: oldBon, catalogItemId: catalogId, serialNumber: 'SN-R4-2' });
    const emptySerial = await equipment({ bonId: partial, catalogItemId: catalogId, serialNumber: '' });
    // Numéro fait d'espaces (donnée ancienne) : sans numéro, pour la carte comme pour la liste.
    const blankSerial = await equipment({ bonId: partial, catalogItemId: catalogId, serialNumber: '   ' });
    // Non restitués : sur un bon clôturé et sur une restitution en cours ; jamais sur un bon annulé.
    const souris = await equipment({ bonId: archived, customLabel: 'Souris', notReturned: true, notReturnedReason: 'Perdue' });
    const ecran = await equipment({ bonId: partial, catalogItemId: catalogId, notReturned: true, notReturnedReason: 'Cassé' });
    await equipment({ bonId: cancelled, customLabel: 'Clavier', notReturned: true });

    Object.assign(expected, {
      notReturned: [souris, ecran],
      offCatalog: [cable],
      missingSerial: [cable, emptySerial, blankSerial],
      bons_crees: [active, archived, cancelled, partial],
      bons_envoyes: [active, partial],
      bons_clotures: [archived],
      bons_annules: [cancelled],
    });
    await audit(active, 'bon_sent', now);
    await audit(active, 'bon_sent', now); // renvoi : le bon compte une fois
    await audit(partial, 'bon_sent', now);
    await audit(oldBon, 'bon_sent', old);
    await audit(cancelled, 'bon_cancelled', now, { reason: 'Doublon' });
    expected.pv_emis = [await audit(archived, 'pv_cloture_emitted', now), await audit(partial, 'pv_cloture_emitted', now)];
    await audit(oldBon, 'pv_cloture_emitted', old);
    expected.remises_sans_signature = [
      await audit(active, 'bon_handover_without_signature', now, { reason: 'Tablette en panne' }),
      await audit(active, 'bon_closed_unilateral', now, { to: 'active', reason: 'Ancien geste' }),
    ];
    expected.clotures_sans_signature = [await audit(archived, 'bon_closed_without_signature', now, { reason: 'Parti' })];
    expected.emails_en_echec = [await email(active, 'failed', now), await email(active, 'bounced', now)];
    await email(active, 'skipped', now, '');
    await email(active, 'failed', now, '');
    await email(active, 'failed', old);
    expected.contestations_recues = [
      await contestation(active, main.userId, 'open', now),
      await contestation(partial, main.userId, 'rejected', now),
    ];
    await contestation(oldBon, main.userId, 'open', old);
  }

  /** Autre filiale : les mêmes événements, qui ne doivent jamais apparaître. */
  async function seedOther(catalogId: string): Promise<void> {
    const other = await makeFiliale('autre');
    const now = new Date();
    const bon = await other.bon('1', 'partially_returned', { archivedAt: now });
    await equipment({ bonId: bon, customLabel: 'Sacoche', serialNumber: ' ' });
    await equipment({ bonId: bon, catalogItemId: catalogId, notReturned: true });
    for (const action of ['bon_sent', 'bon_cancelled', 'pv_cloture_emitted', 'bon_handover_without_signature', 'bon_closed_without_signature']) {
      await audit(bon, action, now);
    }
    await email(bon, 'failed', now);
    await contestation(bon, other.userId, 'open', now);
  }

  /** Équipements désignés par le fragment SQL d'une carte, dans la filiale observée. */
  async function sqlIds(predicate: Prisma.Sql): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT be.id FROM bon_equipments be JOIN bons b ON b.id = be.bon_id
      WHERE ${predicate} AND b.filiale_id = ${filialeId}`);
    return sorted(rows.map((r) => r.id));
  }

  const inventoryIds = async (query: Record<string, unknown>): Promise<{ total: number; ids: string[] }> => {
    const list = await new InventoryService(prisma).getInventory({ filialeId, limit: 200, ...query } as never);
    return { total: list.total, ids: sorted(list.items.map((i) => i.equipmentId)) };
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await cleanup();
    const catalog = await prisma.equipmentCatalog.create({ data: { category: 'pc_portable', brand: `${TEST_PREFIX}-Dell`, model: 'Latitude' } });
    await seedMain(catalog.id);
    await seedOther(catalog.id);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('cartes d’équipements → inventaire filtré', () => {
    it('« Encore non restitués » (Parc et Incidents) = inventaire « Non restitué », mêmes équipements', async () => {
      const parc = await new KpiParcService(prisma).getParc(period, filialeId);
      const incidents = await new KpiIncidentsService(prisma).getIncidents(period, filialeId);
      const list = await inventoryIds({ situation: 'non_restitue' });

      expect(list.ids).toEqual(sorted(expected.notReturned));
      expect(await sqlIds(notReturnedEquipmentSql())).toEqual(list.ids);
      expect(parc.notReturned.openNow).toBe(list.total);
      expect(incidents.notReturned.stillMissing).toBe(list.total);
    });

    it('la liste « Non restitué » donne le motif et ne met jamais un équipement en retard', async () => {
      const list = await new InventoryService(prisma).getInventory({ filialeId, situation: 'non_restitue', sort: 'situation', limit: 200 } as never);
      expect(list.items).toHaveLength(list.total);
      expect(list.items.map((i) => i.situationLabel)).toEqual(['Non restitué', 'Non restitué']);
      expect(list.items.map((i) => i.notReturnedReason).sort()).toEqual(['Cassé', 'Perdue']);
    });

    it('« Hors catalogue » = inventaire hors catalogue, mêmes équipements', async () => {
      const parc = await new KpiParcService(prisma).getParc(period, filialeId);
      const list = await inventoryIds({ horsCatalogue: true });
      const { total, offCatalogShare } = parc.loaned;

      expect(total).toBe(5);
      expect(list.ids).toEqual(sorted(expected.offCatalog));
      expect(await sqlIds(Prisma.sql`${parcEquipmentSql()} AND ${offCatalogSql()}`)).toEqual(list.ids);
      expect(Math.round((offCatalogShare ?? 0) * total)).toBe(list.total);
    });

    it('« Avec numéro de série » : absent, vide ou fait d’espaces = sans numéro, pour la carte comme pour la liste', async () => {
      const parc = await new KpiParcService(prisma).getParc(period, filialeId);
      const list = await inventoryIds({ sansNumeroSerie: true });
      const { total, serialCoverage } = parc.loaned;

      expect(list.ids).toEqual(sorted(expected.missingSerial));
      expect(await sqlIds(Prisma.sql`${parcEquipmentSql()} AND ${missingSerialSql()}`)).toEqual(list.ids);
      expect(total - Math.round((serialCoverage ?? 0) * total)).toBe(list.total);
    });
  });

  it('ligne « Retour en retard » d’un bon (direction) = inventaire en retard filtré sur sa référence', async () => {
    const parc = await new KpiParcService(prisma).getParc(period, filialeId);
    const [row] = parc.returnOverdue.top;
    const list = await new InventoryService(prisma).getInventory({ filialeId, overdue: true, search: row.reference, limit: 200 } as never);
    expect(row.equipments).toBe(2);
    expect(list.total).toBe(row.equipments);
  });

  describe('cartes de bons et d’événements → liste du chiffre', () => {
    const cardValue = async (key: KpiListKey): Promise<number> => {
      const delais = await new KpiDelaisService(prisma, configStub).getDelais(period, filialeId);
      const incidents = await new KpiIncidentsService(prisma).getIncidents(period, filialeId);
      const values: Record<KpiListKey, number> = {
        bons_crees: delais.volumes.created.current,
        bons_envoyes: delais.volumes.sent.current,
        bons_clotures: delais.volumes.archived.current,
        bons_annules: delais.volumes.cancelled.current,
        pv_emis: incidents.pvCloture.emitted.current,
        remises_sans_signature: incidents.withoutSignature.handovers.current,
        clotures_sans_signature: incidents.withoutSignature.closures.current,
        contestations_recues: incidents.contestations.received.current,
        emails_en_echec: incidents.failedEmails.count.current,
      };
      expect(incidents.cancellations.count.current).toBe(delais.volumes.cancelled.current);
      return values[key];
    };

    it.each(KPI_LIST_KEYS.map((key) => [key]))('%s : la liste montre exactement ce que compte la carte', async (key) => {
      const list = await new KpiListService(prisma).getList({ indicateur: key, ...range, filialeId, limit: 200 });
      const value = await cardValue(key);

      expect(sorted(list.items.map((i) => i.id))).toEqual(sorted(expected[key]));
      expect(list.total).toBe(value);
      expect(list.items).toHaveLength(value);
      expect(list.period).toEqual(range);
    });

    it('pagine sans perdre ni répéter de ligne', async () => {
      const service = new KpiListService(prisma);
      const first = await service.getList({ indicateur: 'bons_crees', ...range, filialeId, page: 1, limit: 3 });
      const second = await service.getList({ indicateur: 'bons_crees', ...range, filialeId, page: 2, limit: 3 });
      const ids = [...first.items, ...second.items].map((i) => i.id);
      expect(first.total).toBe(4);
      expect(sorted(ids)).toEqual(sorted(expected.bons_crees));
    });

    it('donne le motif d’une remise sans signature et l’issue d’une contestation', async () => {
      const service = new KpiListService(prisma);
      const handovers = await service.getList({ indicateur: 'remises_sans_signature', ...range, filialeId });
      const contestations = await service.getList({ indicateur: 'contestations_recues', ...range, filialeId });
      expect(handovers.items.map((i) => i.detail).sort()).toEqual(['Ancien geste', 'Tablette en panne']);
      expect(contestations.items.map((i) => i.detail).sort()).toEqual(['Non retenue', 'À traiter']);
    });
  });
});
