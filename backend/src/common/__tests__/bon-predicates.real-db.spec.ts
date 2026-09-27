/**
 * Prédicats des indicateurs contre une VRAIE base PostgreSQL : chaque notion
 * (« Signatures attendues », « Signature en retard », « Lien expiré »,
 * « Retour en retard », « Contestations à traiter ») existe en deux écritures,
 * un `where` Prisma (listes) et un fragment SQL (indicateurs). Ce test vérifie
 * qu'elles comptent exactement les mêmes lignes, avec les pièges que seule la
 * base révèle : cast `::text` des colonnes enum, `COUNT(*)::bigint`, colonnes
 * `timestamp` sans fuseau comparées à un instant, date civile de Paris.
 *
 * Exécution (base jetable, migrations appliquées) :
 *   cd backend && RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/common/__tests__/bon-predicates.real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée. Les données portent le préfixe
 * TEST_PREFIX et sont supprimées à la fin.
 */
import { BonStatus, Prisma, SignatureType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  awaitingSignatureSql,
  buildAwaitingSignatureWhere,
  buildContestationToProcessWhere,
  buildExpiredLinkWhere,
  buildOverdueSignatureWhere,
  buildReturnOverdueEquipmentWhere,
  overdueSignatureSql,
  returnOverdueEquipmentSql,
} from '../bon-predicates';
import { addDaysToIsoDate, isoDateToUtc, todayInParis } from '../dates/paris';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

const TEST_PREFIX = 'zz-predicats-2d';
const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_DAYS = 7;

interface SignatureFixture {
  type: SignatureType;
  signed?: boolean;
  /** Décalage de l'expiration du lien par rapport à maintenant, en jours. */
  expiresInDays: number;
  invalidated?: boolean;
}

interface BonFixture {
  key: string;
  status: BonStatus;
  /** Ancienneté de la demande de signature en cours, en jours (null = rien n'attend). */
  awaitingDaysAgo: number | null;
  /** Ancienneté de la dernière modification technique, en jours. */
  updatedDaysAgo: number;
  signatures?: SignatureFixture[];
  /** Date de restitution prévue, en jours par rapport à aujourd'hui (Paris). */
  restitutionInDays?: number;
  /** Équipements : `returned` = déjà rendu. */
  equipments?: Array<{ returned?: boolean; notReturned?: boolean }>;
}

const FIXTURES: readonly BonFixture[] = [
  // Remise à signer depuis 10 jours : attendue et en retard.
  { key: 'remise-ancienne', status: 'sent_mise_dispo', awaitingDaysAgo: 10, updatedDaysAgo: 0 },
  // Demande récente mais bon modifié il y a longtemps : ni updatedAt ni ancien calcul.
  { key: 'remise-recente', status: 'sent_mise_dispo', awaitingDaysAgo: 2, updatedDaysAgo: 30 },
  // Juste avant et juste après le seuil (une heure de marge).
  { key: 'seuil-depasse', status: 'sent_restitution', awaitingDaysAgo: THRESHOLD_DAYS + 1 / 24, updatedDaysAgo: 0 },
  { key: 'seuil-non-atteint', status: 'sent_restitution', awaitingDaysAgo: THRESHOLD_DAYS - 1 / 24, updatedDaysAgo: 0 },
  // En cours, rien n'attend : jamais compté, même modifié il y a longtemps.
  { key: 'en-cours', status: 'active', awaitingDaysAgo: null, updatedDaysAgo: 40, restitutionInDays: -1,
    equipments: [{}, { returned: true }, { notReturned: true }] },
  // Retour prévu aujourd'hui : pas encore en retard.
  { key: 'retour-aujourdhui', status: 'active', awaitingDaysAgo: null, updatedDaysAgo: 1, restitutionInDays: 0,
    equipments: [{}] },
  // PV à signer, lien vivant : attendu, en retard.
  { key: 'pv-vivant', status: 'partially_returned', awaitingDaysAgo: 9, updatedDaysAgo: 0,
    signatures: [{ type: 'pv_cloture', expiresInDays: 5 }], restitutionInDays: -3, equipments: [{}, {}] },
  // PV à signer dont le lien a expiré : toujours attendu (il faut renvoyer le lien).
  { key: 'pv-expire', status: 'partially_returned', awaitingDaysAgo: 3, updatedDaysAgo: 0,
    signatures: [{ type: 'pv_cloture', expiresInDays: -1 }] },
  // Lien invalidé (nouveau lien, contestation…) : plus rien n'attend.
  { key: 'pv-invalide', status: 'partially_returned', awaitingDaysAgo: 9, updatedDaysAgo: 0,
    signatures: [{ type: 'pv_cloture', expiresInDays: 5, invalidated: true }] },
  // Restitution partielle signée : plus rien n'attend.
  { key: 'partiel-signe', status: 'partially_returned', awaitingDaysAgo: 9, updatedDaysAgo: 0,
    signatures: [{ type: 'restitution', expiresInDays: 5, signed: true }] },
  // Lien expiré, aucun autre : attendu et « lien expiré ».
  { key: 'lien-expire', status: 'sent_restitution', awaitingDaysAgo: 12, updatedDaysAgo: 0,
    signatures: [{ type: 'restitution', expiresInDays: -1 }] },
  // Ancien lien expiré puis renvoyé : le nouveau est vivant, pas « expiré ».
  { key: 'lien-renvoye', status: 'sent_mise_dispo', awaitingDaysAgo: 12, updatedDaysAgo: 0,
    signatures: [{ type: 'mise_disposition', expiresInDays: -2 }, { type: 'mise_disposition', expiresInDays: 3 }] },
  // Brouillon et bon clos : hors de tout.
  { key: 'brouillon', status: 'draft', awaitingDaysAgo: null, updatedDaysAgo: 50, restitutionInDays: -10, equipments: [{}] },
  { key: 'cloture', status: 'archived', awaitingDaysAgo: 20, updatedDaysAgo: 50, restitutionInDays: -10, equipments: [{}] },
];

describeDb('Prédicats des indicateurs (base réelle)', () => {
  let prisma: PrismaService;
  let filialeId: string;
  const ids = new Map<string, string>();

  async function cleanup(): Promise<void> {
    const filter = { bon: { reference: { startsWith: TEST_PREFIX } } };
    await prisma.contestation.deleteMany({ where: filter });
    await prisma.signature.deleteMany({ where: filter });
    await prisma.bonEquipment.deleteMany({ where: filter });
    await prisma.bon.deleteMany({ where: { reference: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    await prisma.filiale.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  }

  function onFiliale(where: Prisma.BonWhereInput): Prisma.BonWhereInput {
    return { AND: [where, { filialeId }] };
  }

  async function sqlCount(predicate: Prisma.Sql): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM bons b WHERE ${predicate} AND b.filiale_id = ${filialeId}
    `);
    return Number(rows[0].count);
  }

  async function referencesOf(where: Prisma.BonWhereInput): Promise<string[]> {
    const bons = await prisma.bon.findMany({ where: onFiliale(where), select: { reference: true } });
    return bons.map((b) => b.reference.replace(`${TEST_PREFIX}-`, '')).sort();
  }

  async function createBon(f: BonFixture, index: number, userIds: { it: string; collab: string }): Promise<void> {
    const now = Date.now();
    const today = todayInParis();
    const bon = await prisma.bon.create({
      data: {
        reference: `${TEST_PREFIX}-${f.key}`,
        filialeId,
        collaborateurId: userIds.collab,
        createdById: userIds.it,
        civilite: 'mme',
        status: f.status,
        dateMiseDisposition: isoDateToUtc(addDaysToIsoDate(today, -60)),
        dateRestitution: f.restitutionInDays === undefined ? null : isoDateToUtc(addDaysToIsoDate(today, f.restitutionInDays)),
        awaitingSince: f.awaitingDaysAgo === null ? null : new Date(now - f.awaitingDaysAgo * DAY_MS),
        equipments: {
          create: (f.equipments ?? []).map((e, i) => ({
            customLabel: `Écran ${i}`,
            returnedAt: e.returned ? new Date(now - DAY_MS) : null,
            notReturned: e.notReturned ?? false,
          })),
        },
        signatures: {
          create: (f.signatures ?? []).map((s, i) => ({
            type: s.type,
            token: `${TEST_PREFIX}-${index}-${i}`,
            signed: s.signed ?? false,
            signedAt: s.signed ? new Date(now - DAY_MS) : null,
            tokenExpiresAt: new Date(now + s.expiresInDays * DAY_MS),
            invalidatedAt: s.invalidated ? new Date(now - DAY_MS) : null,
            invalidatedReason: s.invalidated ? 'replaced' : null,
          })),
        },
      },
    });
    // `updatedAt` est posé par Prisma à chaque écriture : on le recule en SQL.
    await prisma.$executeRaw`UPDATE bons SET updated_at = ${new Date(now - f.updatedDaysAgo * DAY_MS)} WHERE id = ${bon.id}`;
    ids.set(f.key, bon.id);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await cleanup();
    const filiale = await prisma.filiale.create({
      data: { name: `${TEST_PREFIX}-filiale`, displayName: `${TEST_PREFIX} Filiale` },
    });
    filialeId = filiale.id;
    const it = await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-it`, email: `${TEST_PREFIX}-it@test.local`, displayName: 'IT', role: 'admin' },
    });
    const collab = await prisma.user.create({
      data: { samAccountName: `${TEST_PREFIX}-lea`, email: `${TEST_PREFIX}-lea@test.local`, displayName: 'Léa', role: 'collaborator' },
    });
    for (const [index, f] of FIXTURES.entries()) {
      await createBon(f, index, { it: it.id, collab: collab.id });
    }
    await prisma.contestation.createMany({
      data: (['open', 'in_review', 'resolved', 'rejected'] as const).map((status) => ({
        bonId: ids.get('en-cours') as string,
        userId: collab.id,
        message: `${TEST_PREFIX} ${status}`,
        status,
      })),
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('« Signatures attendues » : statuts à signer et PV ou restitution au lien encore valable', async () => {
    expect(await referencesOf(buildAwaitingSignatureWhere())).toEqual([
      'lien-expire', 'lien-renvoye', 'pv-expire', 'pv-vivant', 'remise-ancienne', 'remise-recente', 'seuil-depasse',
      'seuil-non-atteint',
    ]);
    expect(await sqlCount(awaitingSignatureSql())).toBe(8);
  });

  it('« Signature en retard » : mesurée sur awaitingSince, jamais sur updatedAt', async () => {
    const now = new Date();
    expect(await referencesOf(buildOverdueSignatureWhere(THRESHOLD_DAYS, now))).toEqual([
      'lien-expire', 'lien-renvoye', 'pv-vivant', 'remise-ancienne', 'seuil-depasse',
    ]);
    expect(await sqlCount(overdueSignatureSql(THRESHOLD_DAYS, now))).toBe(5);
  });

  it('« Lien expiré » : le dernier lien du document a expiré sans être remplacé', async () => {
    expect(await referencesOf(buildExpiredLinkWhere(new Date()))).toEqual(['lien-expire', 'pv-expire']);
  });

  it('« Retour en retard » : équipements encore sortis, date prévue (Paris) dépassée', async () => {
    const where: Prisma.BonEquipmentWhereInput = buildReturnOverdueEquipmentWhere({ filialeId }, new Date());
    const prismaCount = await prisma.bonEquipment.count({ where });
    const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM bon_equipments be JOIN bons b ON b.id = be.bon_id
      WHERE ${returnOverdueEquipmentSql()} AND b.filiale_id = ${filialeId}
    `);
    // en-cours : 1 sur 3 (un rendu, un déclaré non restitué) ; pv-vivant : 2.
    expect(prismaCount).toBe(3);
    expect(Number(rows[0].count)).toBe(3);
  });

  // Sur toute la base (lancée sur une copie amorcée, elle porte le volume du
  // banc) : les deux écritures désignent exactement les mêmes bons, pas
  // seulement le même nombre.
  it('toute la base : SQL et Prisma désignent les mêmes bons et les mêmes équipements', async () => {
    const now = new Date();
    const cases: Array<[Prisma.BonWhereInput, Prisma.Sql]> = [
      [buildAwaitingSignatureWhere(), awaitingSignatureSql()],
      [buildOverdueSignatureWhere(THRESHOLD_DAYS, now), overdueSignatureSql(THRESHOLD_DAYS, now)],
    ];
    for (const [where, sql] of cases) {
      const viaPrisma = (await prisma.bon.findMany({ where, select: { id: true } })).map((b) => b.id).sort();
      const viaSql = (await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT b.id FROM bons b WHERE ${sql}`))
        .map((r) => r.id).sort();
      expect(viaSql).toEqual(viaPrisma);
    }
    const equipmentsViaPrisma = (await prisma.bonEquipment.findMany({
      where: buildReturnOverdueEquipmentWhere({}, now), select: { id: true },
    })).map((e) => e.id).sort();
    const equipmentsViaSql = (await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT be.id FROM bon_equipments be JOIN bons b ON b.id = be.bon_id WHERE ${returnOverdueEquipmentSql()}
    `)).map((r) => r.id).sort();
    expect(equipmentsViaSql).toEqual(equipmentsViaPrisma);
  });

  it('« Contestations à traiter » : ouvertes ou prises en charge, pas tranchées', async () => {
    const count = await prisma.contestation.count({
      where: { AND: [buildContestationToProcessWhere(), { bon: { filialeId } }] },
    });
    expect(count).toBe(2);
  });
});
