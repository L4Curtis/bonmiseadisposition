import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Garde-fou anti désactivation massive (LOT C bug #7) : au-delà de ce ratio ET
// de ce nombre absolu de comptes concernés, la sync interrompt la phase de
// désactivation plutôt que de vider l'annuaire suite à un search_base ou un
// user_filter mal saisi.
export const MASS_DEACTIVATION_RATIO_THRESHOLD = 0.2;
export const MASS_DEACTIVATION_MIN_COUNT = 5;

export interface DeactivateAbsentUsersResult {
  aborted: boolean;
  abortMessage: string | null;
}

/**
 * Désactive les comptes LDAP absents du dernier import (lastLdapSync <
 * syncStart), sauf si cela représenterait une part disproportionnée du parc
 * (LOT C bug #7) : au-delà de 20 % ET d'au moins 5 comptes, un
 * search_base/user_filter mal saisi ne doit pas vider l'annuaire — on
 * n'abandonne QUE cette phase, pas les créations/mises à jour déjà appliquées
 * par upsertLdapUsers().
 */
export async function deactivateAbsentLdapUsers(
  prisma: PrismaService,
  logger: Logger,
  syncStart: Date,
): Promise<DeactivateAbsentUsersResult> {
  // isManualAccount: false explicite (LOT compagnons de chantier) : un compte
  // créé à la main (POST /users/manual) n'a jamais lastLdapSync renseigné,
  // donc `lastLdapSync: { lt: syncStart }` l'exclurait déjà implicitement —
  // l'exclusion ci-dessous reste posée en dur pour ne jamais dépendre de cet
  // effet de bord si le champ venait à être renseigné par erreur ailleurs.
  const deactivationWhere = {
    isLocalAccount: false,
    isManualAccount: false,
    active: true,
    lastLdapSync: { lt: syncStart },
  };
  const toDeactivate = await prisma.user.count({ where: deactivationWhere });
  const activeLdapAccounts = await prisma.user.count({
    where: { isLocalAccount: false, isManualAccount: false, active: true, lastLdapSync: { not: null } },
  });
  const ratio = activeLdapAccounts > 0 ? toDeactivate / activeLdapAccounts : 0;

  const shouldAbort =
    toDeactivate >= MASS_DEACTIVATION_MIN_COUNT &&
    ratio > MASS_DEACTIVATION_RATIO_THRESHOLD;

  if (shouldAbort) {
    const abortMessage = `Sync interrompue : ${toDeactivate} comptes seraient désactivés (>20 %). Vérifiez search_base / user_filter.`;
    logger.error(
      `LDAP sync: désactivation annulée — ${toDeactivate}/${activeLdapAccounts} comptes ` +
      `(${Math.round(ratio * 100)}%) seraient désactivés`,
    );
    await prisma.auditLog.create({
      data: {
        action: 'ldap_sync_aborted',
        details: { toDeactivate, total: activeLdapAccounts, ratio },
      },
    }).catch((auditErr: unknown) => {
      logger.error(`Audit ldap_sync_aborted non journalisé: ${(auditErr as Error).message}`);
    });
    return { aborted: true, abortMessage };
  }

  const deactivated = await prisma.user.updateMany({
    where: deactivationWhere,
    data: { active: false },
  });
  if (deactivated.count > 0) {
    logger.warn(`LDAP sync: ${deactivated.count} compte(s) absent(s) de l'annuaire désactivé(s)`);
  }
  return { aborted: false, abortMessage: null };
}
