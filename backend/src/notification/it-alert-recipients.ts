import { Prisma } from '@prisma/client';
import { IT_ROLES } from '../common/roles';
import { isDeliverableEmail } from '../common/email';

/** Accès minimal à la base : le service Prisma comme un client de transaction. */
export type ItAlertRecipientsSource = Pick<Prisma.TransactionClient, 'user'>;

/**
 * Adresses des destinataires des alertes IT (contestation, départ d'un
 * collaborateur qui détient encore du matériel) : TOUS les administrateurs et
 * techniciens actifs, choisis par leur RÔLE. La colonne `isItStaff`, simple
 * copie du rôle, n'est plus lue.
 *
 * Un compte sans adresse délivrable (compte technique `admin@local`, compte
 * manuel sans email) est écarté : l'envoi échouerait de toute façon. Une même
 * adresse n'apparaît qu'une fois, quelle que soit sa casse.
 */
export async function findItAlertRecipients(prisma: ItAlertRecipientsSource): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: { role: { in: [...IT_ROLES] }, active: true },
    select: { email: true },
  });
  const seen = new Set<string>();
  return staff
    .map((s) => s.email?.trim() ?? '')
    .filter((email) => isDeliverableEmail(email))
    .filter((email) => {
      const normalized = email.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}
