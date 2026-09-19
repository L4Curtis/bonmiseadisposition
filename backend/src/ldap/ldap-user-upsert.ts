import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../auth/utils/normalize-email.util';
import { LdapUser } from './ldap-entry-parser';

export interface UpsertLdapUsersResult {
  skipped: number;
}

/**
 * Upsert un par un (plus de transaction par lot de 50) : une collision
 * d'email/identifiant sur UN utilisateur n'annule plus tout le lot (LOT C bug
 * #6c). Recherche d'abord par email normalisé insensible à la casse — SSO et
 * LDAP peuvent avoir créé la même personne avec un sAMAccountName différent
 * (renommage AD, ancien compte SSO...) ; upserter directement par
 * sAMAccountName créerait alors un doublon et échouerait en P2002 sur
 * l'email.
 */
export async function upsertLdapUsers(
  prisma: PrismaService,
  logger: Logger,
  ldapUsers: LdapUser[],
): Promise<UpsertLdapUsersResult> {
  // Load all filiales for company matching
  const filiales = await prisma.filiale.findMany({ where: { active: true } });
  let skipped = 0;

  for (const lu of ldapUsers) {
    const email = normalizeEmail(lu.mail);
    const filiale = filiales.find(
      (f) => f.name.toLowerCase() === (lu.company || '').toLowerCase(),
    );
    const data = {
      displayName: lu.displayName,
      email,
      department: lu.department,
      company: lu.company,
      title: lu.title,
      filialeId: filiale?.id ?? null,
      lastLdapSync: new Date(),
      active: true,
    };

    try {
      const existingByEmail = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

      // Un compte manuel (POST /users/manual, compagnon de chantier sans
      // compte AD) ne doit jamais être désactivé, modifié ni écrasé par la
      // synchronisation — même s'il partage l'email d'une fiche annuaire (ex.
      // le compagnon obtient ensuite un vrai compte AD). On l'ignore plutôt
      // que de le fusionner/écraser : une éventuelle fusion reste une
      // décision manuelle de l'administrateur.
      if (existingByEmail?.isManualAccount) {
        skipped++;
        logger.warn(
          `LDAP sync: ${lu.sAMAccountName} (${email}) correspond à un compte manuel existant — ignoré (jamais écrasé par la synchronisation)`,
        );
        continue;
      }

      if (existingByEmail && existingByEmail.samAccountName !== lu.sAMAccountName) {
        // Même personne (même email), identifiant AD différent : on met à
        // jour l'enregistrement existant plutôt que d'upserter par
        // sAMAccountName, ce qui créerait un doublon + P2002 sur l'email.
        await prisma.user.update({ where: { id: existingByEmail.id }, data });
      } else {
        // Garde-fou symétrique côté sAMAccountName (collision en théorie
        // impossible — les comptes manuels sont préfixés "manuel." — mais
        // vérifiée explicitement plutôt que supposée).
        const existingBySam = await prisma.user.findUnique({
          where: { samAccountName: lu.sAMAccountName },
        });
        if (existingBySam?.isManualAccount) {
          skipped++;
          logger.warn(
            `LDAP sync: sAMAccountName ${lu.sAMAccountName} correspond à un compte manuel existant — ignoré (jamais écrasé par la synchronisation)`,
          );
          continue;
        }
        await prisma.user.upsert({
          where: { samAccountName: lu.sAMAccountName },
          update: data,
          create: { ...data, samAccountName: lu.sAMAccountName, role: 'collaborator' },
        });
      }
    } catch (err: unknown) {
      skipped++;
      const isUniqueConstraintViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (isUniqueConstraintViolation) {
        logger.warn(
          `LDAP sync: collision d'email/identifiant pour ${lu.sAMAccountName} (${email}) — utilisateur ignoré, synchronisation poursuivie`,
        );
      } else {
        logger.error(
          `LDAP sync: échec de la mise à jour pour ${lu.sAMAccountName} (${email}): ${(err as Error).message}`,
        );
      }
    }
  }

  return { skipped };
}
