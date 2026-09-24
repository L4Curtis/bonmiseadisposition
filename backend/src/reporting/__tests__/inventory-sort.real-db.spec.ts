/**
 * Tri et filtre « sans numéro de série » de l'inventaire contre une VRAIE base
 * PostgreSQL — complément de src/__tests__/sql-real-db.spec.ts.
 *
 * Pourquoi : les specs unitaires simulent Prisma et ne vérifient que la forme
 * de `orderBy`. Seule une base réelle confirme que chaque tri est accepté par
 * Prisma/PostgreSQL (tri sur relation, option `nulls`, enum), qu'il ordonne
 * réellement les lignes et que la pagination reste stable (aucune ligne vue
 * deux fois ni perdue d'une page à l'autre).
 *
 * Exécution (base jetable ou de développement, migrations appliquées) :
 *   cd backend && RUN_DB_TESTS=1 npx jest src/reporting/__tests__/inventory-sort.real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée. Les données créées portent le
 * préfixe TEST_PREFIX et sont supprimées à la fin.
 */
import { BonStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory.service';
import { INVENTORY_SORT_FIELDS, InventoryQueryDto } from '../dto/inventory-query.dto';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

const TEST_PREFIX = 'zz-tri-inventaire';

interface Fixture {
  label: string;
  serial: string | null;
  collaborateur: string;
  status: BonStatus;
  miseDispo: string;
  restitution: string | null;
}

/** Même date de mise à disposition pour plusieurs lignes : force les ex-æquo
 *  que le tri stable doit départager. */
const FIXTURES: readonly Fixture[] = [
  { label: 'Écran B', serial: 'SN-B', collaborateur: 'Bernard', status: 'active', miseDispo: '2026-03-01', restitution: '2026-12-01' },
  { label: 'Écran A', serial: null, collaborateur: 'Alice', status: 'contested', miseDispo: '2026-03-01', restitution: null },
  { label: 'Écran C', serial: '', collaborateur: 'Claire', status: 'sent_mise_dispo', miseDispo: '2026-03-01', restitution: '2026-10-01' },
  { label: 'Écran D', serial: 'SN-A', collaborateur: 'Alice', status: 'partially_returned', miseDispo: '2026-02-01', restitution: '2026-11-01' },
  { label: 'Écran E', serial: 'SN-C', collaborateur: 'Bernard', status: 'active', miseDispo: '2026-03-01', restitution: null },
];

describeDb('Inventaire — tri et filtre « sans numéro de série » (base réelle)', () => {
  let prisma: PrismaService;
  let service: InventoryService;
  let filialeId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new InventoryService(prisma);
    await cleanup();

    const filiale = await prisma.filiale.create({
      data: { name: `${TEST_PREFIX}-filiale`, displayName: `${TEST_PREFIX} Filiale` },
    });
    filialeId = filiale.id;
    const createdBy = await prisma.user.create({
      data: {
        samAccountName: `${TEST_PREFIX}-it`,
        email: `${TEST_PREFIX}-it@test.local`,
        displayName: `${TEST_PREFIX} IT`,
        role: 'admin',
      },
    });

    for (const [i, f] of FIXTURES.entries()) {
      const collaborateur = await prisma.user.upsert({
        where: { email: `${TEST_PREFIX}-${f.collaborateur}@test.local` },
        update: {},
        create: {
          samAccountName: `${TEST_PREFIX}-${f.collaborateur}`,
          email: `${TEST_PREFIX}-${f.collaborateur}@test.local`,
          displayName: `${TEST_PREFIX} ${f.collaborateur}`,
          role: 'collaborator',
          active: f.collaborateur !== 'Claire',
        },
      });
      await prisma.bon.create({
        data: {
          reference: `${TEST_PREFIX}-${i}`,
          status: f.status,
          civilite: 'mr',
          collaborateurId: collaborateur.id,
          filialeId,
          createdById: createdBy.id,
          dateMiseDisposition: new Date(f.miseDispo),
          dateRestitution: f.restitution ? new Date(f.restitution) : null,
          equipments: { create: [{ customLabel: f.label, serialNumber: f.serial }] },
        },
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function cleanup() {
    await prisma.bon.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { samAccountName: { startsWith: TEST_PREFIX } } });
    await prisma.filiale.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  }

  async function list(query: Partial<InventoryQueryDto>) {
    const { items } = await service.getInventory({ filialeId, limit: 50, ...query });
    return items;
  }

  it.each(INVENTORY_SORT_FIELDS.flatMap((sort) => [
    [sort, 'asc'],
    [sort, 'desc'],
  ] as const))('tri « %s » %s : accepté par la base, liste et export', async (sort, direction) => {
    const items = await list({ sort, direction });
    expect(items).toHaveLength(FIXTURES.length);
    const { csv } = await service.getExportCsv({ filialeId, sort, direction });
    // Même ordre dans l'export que dans la liste (une ligne d'en-tête + 5).
    const csvLabels = csv.split('\n').slice(1).map((line) => line.split(';')[0].replace(/"/g, ''));
    expect(csvLabels).toEqual(items.map((it) => it.label));
  });

  it('ordonne réellement : collaborateur, situation, n° de série et restitution prévue', async () => {
    const byCollab = await list({ sort: 'collaborateur', direction: 'asc' });
    expect(byCollab.map((it) => it.collaborateur.displayName.replace(`${TEST_PREFIX} `, ''))).toEqual([
      'Alice', 'Alice', 'Bernard', 'Bernard', 'Claire',
    ]);

    const bySituation = await list({ sort: 'situation', direction: 'asc' });
    expect(bySituation.map((it) => it.situation)).toEqual([
      'en_attente_signature', 'en_circulation', 'en_circulation', 'en_circulation', 'en_litige',
    ]);
    // Ordre métier et non ordre physique de l'enum (partially_returned y est
    // après contested) : la situation « en circulation » d'un retour partiel
    // doit rester groupée avec les autres.
    const bySituationDesc = await list({ sort: 'situation', direction: 'desc' });
    expect(bySituationDesc.map((it) => it.situation)).toEqual([
      'en_litige', 'en_circulation', 'en_circulation', 'en_circulation', 'en_attente_signature',
    ]);

    // Valeurs absentes (NULL) en fin de liste dans les deux sens.
    const bySerialDesc = await list({ sort: 'serialNumber', direction: 'desc' });
    expect(bySerialDesc.map((it) => it.serialNumber)).toEqual(['SN-C', 'SN-B', 'SN-A', '', null]);
    const byRestitAsc = await list({ sort: 'dateRestitution', direction: 'asc' });
    expect(byRestitAsc.slice(-2).map((it) => it.dateRestitution)).toEqual([null, null]);
    const byRestitDesc = await list({ sort: 'dateRestitution', direction: 'desc' });
    expect(byRestitDesc.slice(-2).map((it) => it.dateRestitution)).toEqual([null, null]);
  });

  it('pagination stable : les pages de 1 ligne reconstituent exactement la liste, sans doublon', async () => {
    for (const sort of INVENTORY_SORT_FIELDS) {
      const full = (await list({ sort })).map((it) => it.equipmentId);
      const paged: string[] = [];
      for (let page = 1; page <= FIXTURES.length; page++) {
        const { items } = await service.getInventory({ filialeId, sort, page, limit: 1 });
        paged.push(...items.map((it) => it.equipmentId));
      }
      expect(paged).toEqual(full);
    }
  });

  it('filtre « sans numéro de série » : NULL et vide, dans la liste et l’export', async () => {
    const items = await list({ sansNumeroSerie: true });
    expect(items.map((it) => it.label).sort()).toEqual(['Écran A', 'Écran C']);
    const { csv } = await service.getExportCsv({ filialeId, sansNumeroSerie: true });
    expect(csv.split('\n')).toHaveLength(3);
  });

  it('expose l’état du compte du collaborateur (compte désactivé)', async () => {
    const items = await list({ sort: 'collaborateur' });
    const claire = items.find((it) => it.collaborateur.displayName.endsWith('Claire'));
    expect(claire?.collaborateur.active).toBe(false);
    expect(items.filter((it) => it.collaborateur.active)).toHaveLength(4);
  });
});
