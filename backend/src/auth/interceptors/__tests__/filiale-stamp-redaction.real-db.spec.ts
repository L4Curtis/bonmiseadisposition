/**
 * Expurgation du cachet sur une VRAIE réponse Prisma.
 *
 * Pourquoi : les tests unitaires de l'intercepteur fabriquent l'objet à la
 * main. Seule la base prouve que le bon chargé par `findBonOrThrow` (select
 * canonique BON_SELECT, celui de `GET /bons/:id` et de « Mes bons ») est bien
 * parcouru — un objet au prototype inattendu serait renvoyé tel quel, cachet
 * compris — et que l'objet d'origine garde son cachet, que la génération des
 * PDF lit juste avant la réponse.
 *
 * Tout est écrit dans une transaction annulée à la fin : rien ne reste en base.
 *   cd backend && RUN_DB_TESTS=1 npx vitest run src/auth/interceptors/__tests__/filiale-stamp-redaction.real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée.
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { findBonOrThrow } from '../../../bons/queries/bon-where';
import { withoutFilialeStamp } from '../filiale-stamp-redaction.interceptor';

const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

class Rollback extends Error {}

describeDb('Cachet de la filiale — bon réel chargé par findBonOrThrow (transaction annulée)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('retire stampPath de la copie renvoyée, sans toucher au bon lu par la génération des PDF', async () => {
    const suffixe = randomUUID().slice(0, 8);
    const cachet = `uploads/test-cachet-${suffixe}.png`;
    let origine: Record<string, unknown> = {};
    let expurge: Record<string, unknown> = {};

    await prisma
      .$transaction(async (tx) => {
        const filiale = await tx.filiale.create({
          data: { name: `test-cachet-${suffixe}`, displayName: `Test cachet ${suffixe}`, stampPath: cachet, logoPath: 'uploads/logo.png' },
        });
        const collaborateur = await tx.user.create({
          data: { samAccountName: `test-cachet-collab-${suffixe}`, displayName: 'Collaborateur test', filialeId: filiale.id },
        });
        const technicien = await tx.user.create({
          data: { samAccountName: `test-cachet-tech-${suffixe}`, displayName: 'Technicien test', role: 'technician' },
        });
        const bon = await tx.bon.create({
          data: {
            reference: `TEST-CACHET-${suffixe}`,
            filialeId: filiale.id,
            collaborateurId: collaborateur.id,
            createdById: technicien.id,
            civilite: 'mr',
            dateMiseDisposition: new Date('2026-09-24T00:00:00Z'),
          },
        });
        origine = await findBonOrThrow(tx as unknown as PrismaService, bon.id) as unknown as Record<string, unknown>;
        // Forme d'une liste (« Mes bons ») : tableau d'objets imbriqués.
        expurge = (withoutFilialeStamp([origine]) as Array<Record<string, unknown>>)[0];
        throw new Rollback();
      })
      .catch((err: unknown) => {
        if (!(err instanceof Rollback)) throw err;
      });

    const filialeOrigine = origine.filiale as Record<string, unknown>;
    const filialeExpurgee = expurge.filiale as Record<string, unknown>;
    expect(filialeOrigine.stampPath).toBe(cachet);
    expect(filialeExpurgee).not.toHaveProperty('stampPath');
    expect(filialeExpurgee.displayName).toBe(`Test cachet ${suffixe}`);
    expect(filialeExpurgee.logoPath).toBe('uploads/logo.png');
    expect(expurge.reference).toBe(`TEST-CACHET-${suffixe}`);
    expect(await prisma.filiale.count({ where: { name: `test-cachet-${suffixe}` } })).toBe(0);
  });
});
