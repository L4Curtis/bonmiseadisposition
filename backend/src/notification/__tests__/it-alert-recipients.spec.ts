/**
 * Destinataires des alertes IT (contestation, départ avec matériel) : tous les
 * administrateurs et techniciens ACTIFS, calculés à partir du RÔLE et non plus
 * de la colonne `isItStaff` (copie du rôle tenue à la main, vouée à
 * disparaître). La même requête contre une vraie base :
 * it-alert-recipients.real-db.spec.ts.
 */
import { findItAlertRecipients, ItAlertRecipientsSource } from '../it-alert-recipients';

describe('findItAlertRecipients — requête envoyée et filtrage des adresses', () => {
  function source(rows: Array<{ email: string | null }>) {
    const findMany = vi.fn().mockResolvedValue(rows);
    return { prisma: { user: { findMany } } as unknown as ItAlertRecipientsSource, findMany };
  }

  it('sélectionne les comptes actifs par rôle (admin, technicien), sans lire isItStaff', async () => {
    const { prisma, findMany } = source([]);
    await findItAlertRecipients(prisma);
    const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).toEqual({ role: { in: ['admin', 'technician'] }, active: true });
    expect(where).not.toHaveProperty('isItStaff');
  });

  it('écarte les adresses absentes ou non délivrables et les doublons de casse', async () => {
    const { prisma } = source([
      { email: 'it1@groupe-livio.fr' },
      { email: null },
      { email: 'admin@local' },
      { email: 'IT1@groupe-livio.fr' },
      { email: 'it2@groupe-livio.fr' },
    ]);
    expect(await findItAlertRecipients(prisma)).toEqual(['it1@groupe-livio.fr', 'it2@groupe-livio.fr']);
  });
});
