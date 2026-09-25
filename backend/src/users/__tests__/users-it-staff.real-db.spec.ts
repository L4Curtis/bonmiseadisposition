/**
 * `UsersService.findItStaff` (filtre « Créé par » de la liste des bons) contre
 * une VRAIE base : la sélection suit le rôle réel, pas la colonne `isItStaff`.
 *
 * Tout est écrit dans une transaction toujours annulée : rien ne reste en base.
 *   cd backend && RUN_DB_TESTS=1 npx vitest run src/users/__tests__/users-it-staff.real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée.
 */
import { randomUUID } from 'crypto';
import { Prisma, UserRole } from '@prisma/client';
import { UsersService } from '../users.service';
import { PrismaService } from '../../prisma/prisma.service';

const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

describeDb('UsersService.findItStaff — base réelle (transaction annulée)', () => {
  let prisma: PrismaService;
  const ANNULATION = new Error('annulation volontaire du test');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('suit le rôle réel et ne renvoie que { id, displayName }', async () => {
    const suffixe = randomUUID().slice(0, 8);
    const compte = (nom: string, role: UserRole, active: boolean): Prisma.UserCreateManyInput => ({
      samAccountName: `test-createurs-${nom}-${suffixe}`,
      displayName: `Test créateurs ${nom} ${suffixe}`,
      role,
      active,
      // Volontairement incohérent avec le rôle : seul le rôle doit compter.
      isItStaff: role === 'collaborator',
    });

    let resultat: Array<Record<string, unknown>> = [];
    await prisma
      .$transaction(async (tx) => {
        await tx.user.createMany({
          data: [
            compte('admin', 'admin', true),
            compte('technicien', 'technician', true),
            compte('technicien-parti', 'technician', false),
            compte('collaborateur', 'collaborator', true),
            compte('direction', 'direction', true),
          ],
        });
        resultat = await new UsersService(tx as unknown as PrismaService).findItStaff();
        throw ANNULATION;
      })
      .catch((err: unknown) => {
        if (err !== ANNULATION) throw err;
      });

    const miens = resultat.filter((u) => String(u.displayName).endsWith(suffixe));
    expect(miens.map((u) => u.displayName)).toEqual([
      `Test créateurs admin ${suffixe}`,
      `Test créateurs technicien ${suffixe}`,
    ]);
    for (const u of miens) expect(Object.keys(u).sort()).toEqual(['displayName', 'id']);
  });
});
