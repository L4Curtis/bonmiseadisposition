/**
 * Filet de sécurité SQL : exécute les requêtes `$queryRaw` des services
 * d'inventaire et d'indicateurs contre une VRAIE base PostgreSQL.
 *
 * Pourquoi : les specs unitaires de ces services simulent `$queryRaw` et
 * vérifient le texte SQL généré. Elles ne peuvent donc pas voir les erreurs que
 * seule la base détecte, et deux d'entre elles sont déjà arrivées en production :
 *   - comparaison d'une colonne enum avec un paramètre texte sans cast `::text`
 *     (« operator does not exist: "BonStatus" = text ») ;
 *   - expression répétée dans le SELECT et le GROUP BY, liée comme deux
 *     paramètres distincts (« column b.status must appear in the GROUP BY clause »).
 *
 * Exécution (base de développement lancée, migrations appliquées) :
 *   cd backend && RUN_DB_TESTS=1 npx vitest run src/__tests__/sql-real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée : la CI et les tests unitaires
 * habituels n'ont besoin d'aucune base.
 */
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../reporting/inventory.service';
import { KpiParcService } from '../kpi/kpi-parc.service';
import { KpiDelaisService } from '../kpi/kpi-delais.service';
import { KpiIncidentsService } from '../kpi/kpi-incidents.service';
import { resolvePeriod } from '../kpi/kpi-period';
import { generateBonReference, BON_REFERENCE_TX_OPTIONS } from '../common/bon-reference';

const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDb = ENABLED ? describe : describe.skip;

/** Config minimale : ces services ne lisent que des seuils numériques, la
 *  valeur exacte n'influence pas la validité du SQL exécuté. */
const configStub = {
  get: async () => null,
  getInt: async (_section: string, _key: string, fallback: number) => fallback,
  getSignatureOverdueDays: async () => 7,
} as never;

describeDb('Requêtes SQL réelles (base de développement)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("résumé d'inventaire : s'exécute et la somme des situations vaut le total", async () => {
    const service = new InventoryService(prisma);
    const summary = await service.getSummary();

    expect(typeof summary.total).toBe('number');
    expect(summary.bySituation).toHaveLength(3);
    const somme = summary.bySituation.reduce((acc, s) => acc + s.count, 0);
    expect(somme).toBe(summary.total);
  });

  it('liste et export CSV de l’inventaire : s’exécutent, filtre situation compris', async () => {
    const service = new InventoryService(prisma);

    const liste = await service.getInventory({ page: 1, limit: 5 } as never);
    expect(Array.isArray(liste.items)).toBe(true);

    const filtree = await service.getInventory({ page: 1, limit: 5, situation: 'en_circulation' } as never);
    for (const item of filtree.items) expect(item.situation).toBe('en_circulation');

    const { csv } = await service.getExportCsv({} as never);
    expect(csv).toContain('Situation');
  });

  it('indicateurs de parc : s’exécutent et concordent avec l’inventaire', async () => {
    const parcService = new KpiParcService(prisma, configStub);
    const inventaire = new InventoryService(prisma);
    const period = resolvePeriod({});

    const parc = await parcService.getParc(period);
    const summary = await inventaire.getSummary();

    expect(parc.loaned.total).toBe(summary.total);
    expect(parc.loaned.bySituation.reduce((acc, s) => acc + s.count, 0)).toBe(parc.loaned.total);
    expect(Array.isArray(parc.loaned.series)).toBe(true);
  });

  it('indicateurs de délais et d’incidents : s’exécutent sans erreur SQL', async () => {
    const period = resolvePeriod({});

    const delais = await new KpiDelaisService(prisma, configStub).getDelais(period);
    expect(Array.isArray(delais.statusBreakdown)).toBe(true);

    const incidents = await new KpiIncidentsService(prisma, configStub).getIncidents(period);
    expect(typeof incidents.cancellations.count.current).toBe('number');
  });

  // Régression : une référence non numérique (données de démonstration
  // « BON-AAAA-D0040 », reprise d'un ancien système) faisait échouer le CAST
  // en INTEGER de toute la requête — plus aucun bon ne pouvait être créé.
  // Seul Postgres peut le montrer : les tests unitaires simulent $queryRaw.
  // Tout se passe dans une transaction annulée : la base n'est pas modifiée.
  it('génère une référence même en présence de références non numériques', async () => {
    const annulation = new Error('annulation volontaire du test');
    const annee = new Date().getFullYear();
    let reference = '';

    await expect(
      prisma.$transaction(async (tx) => {
        const filiale = await tx.filiale.create({
          data: { name: `test-ref-${Date.now()}`, displayName: 'Test référence' },
        });
        const user = await tx.user.create({
          data: { samAccountName: `test-ref-${Date.now()}`, displayName: 'Test référence' },
        });
        await tx.bon.create({
          data: {
            reference: `BON-${annee}-D9999`,
            filialeId: filiale.id,
            collaborateurId: user.id,
            createdById: user.id,
            civilite: 'mr',
            dateMiseDisposition: new Date(),
          },
        });

        reference = await generateBonReference(tx);
        throw annulation;
      }, BON_REFERENCE_TX_OPTIONS),
    ).rejects.toBe(annulation);

    expect(reference.startsWith(`BON-${annee}-`)).toBe(true);
    expect(reference).toMatch(/^BON-\d{4}-\d{4,}$/);
  });
});
