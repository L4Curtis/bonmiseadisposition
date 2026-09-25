/**
 * Destinataires des alertes IT contre une VRAIE base : la sélection suit le
 * rôle réel, même quand la colonne `isItStaff` le contredit.
 *
 * Tout est écrit dans une transaction toujours annulée : rien ne reste en base.
 *   cd backend && RUN_DB_TESTS=1 npx vitest run src/notification/__tests__/it-alert-recipients.real-db.spec.ts
 * Sans `RUN_DB_TESTS=1`, la suite est ignorée.
 */
import { randomUUID } from 'crypto';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { findItAlertRecipients } from '../it-alert-recipients';

const describeDb = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

describeDb('findItAlertRecipients — base réelle (transaction annulée)', () => {
  let prisma: PrismaService;
  const ANNULATION = new Error('annulation volontaire du test');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('suit le rôle réel, même quand isItStaff le contredit', async () => {
    const suffixe = randomUUID().slice(0, 8);
    const compte = (nom: string, role: UserRole, active: boolean, isItStaff: boolean): Prisma.UserCreateManyInput => ({
      samAccountName: `test-alertes-${nom}-${suffixe}`,
      displayName: `Test alertes ${nom}`,
      email: `alertes-${nom}-${suffixe}@groupe-livio.fr`,
      role,
      active,
      isItStaff,
    });
    const email = (nom: string) => `alertes-${nom}-${suffixe}@groupe-livio.fr`;

    let destinataires: string[] = [];
    await prisma
      .$transaction(async (tx) => {
        await tx.user.createMany({
          data: [
            compte('admin', 'admin', true, true),
            compte('technicien-sans-drapeau', 'technician', true, false),
            compte('collaborateur-avec-drapeau', 'collaborator', true, true),
            compte('direction', 'direction', true, false),
            compte('technicien-desactive', 'technician', false, true),
          ],
        });
        destinataires = await findItAlertRecipients(tx);
        throw ANNULATION;
      })
      .catch((err: unknown) => {
        if (err !== ANNULATION) throw err;
      });

    expect(destinataires).toContain(email('admin'));
    expect(destinataires).toContain(email('technicien-sans-drapeau'));
    expect(destinataires).not.toContain(email('collaborateur-avec-drapeau'));
    expect(destinataires).not.toContain(email('direction'));
    expect(destinataires).not.toContain(email('technicien-desactive'));
    // La transaction a bien été annulée : rien n'est resté en base.
    expect(await prisma.user.count({ where: { samAccountName: { endsWith: suffixe } } })).toBe(0);
  });
});
