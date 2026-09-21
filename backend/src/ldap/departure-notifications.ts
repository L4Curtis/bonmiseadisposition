import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildParcEquipmentWhere } from '../common/bon-predicates';
import {
  COLLABORATEUR_GROUP_SELECT,
  groupInventoryByCollaborateur,
  CollaborateurInventoryItem,
} from '../reporting/inventory-collaborateur-aggregate';

/** Action d'audit tracant l'envoi de l'alerte « départ avec matériel » pour un
 *  collaborateur donné (une entrée par collaborateur notifié, jamais par bon). */
export const DEPARTURE_NOTIFIED_ACTION = 'departure_notified';

/**
 * Collaborateurs actuellement inactifs (`User.active = false`) qui détiennent
 * encore du matériel du parc en circulation — même prédicat que
 * /reporting/inventory (PARC_BON_STATUSES, équipement ni rendu ni déclaré
 * perdu, cf. bon-predicates.ts), restreint aux comptes désactivés.
 *
 * Réutilise tel quel l'agrégat de /reporting/inventory/by-collaborateur
 * (COLLABORATEUR_GROUP_SELECT + groupInventoryByCollaborateur) pour ne jamais
 * dupliquer ni la définition du parc en circulation, ni le calcul du nom, de
 * la filiale, du nombre d'équipements et de l'ancienneté du prêt le plus
 * ancien — cf. l'audit du 2026-09-18 dans bon-predicates.ts sur le coût d'une
 * telle duplication. N'utilise PAS InventoryService (non exporté par
 * ReportingModule, et sa pagination ne convient pas à cet usage interne où la
 * liste complète est nécessaire).
 */
export async function getInactiveCollaborateurGroups(
  prisma: PrismaService,
  now: Date = new Date(),
): Promise<CollaborateurInventoryItem[]> {
  const rows = await prisma.bonEquipment.findMany({
    where: {
      AND: [
        ...(buildParcEquipmentWhere().AND as Prisma.BonEquipmentWhereInput[]),
        { bon: { collaborateur: { active: false } } },
      ],
    },
    select: COLLABORATEUR_GROUP_SELECT,
  });
  return groupInventoryByCollaborateur(rows, now);
}

/** Dernière notification connue par collaborateur (la plus récente si
 *  plusieurs, ce qui ne devrait pas arriver en pratique). Table d'audit lue en
 *  entier : le volume réel (une ligne par départ effectivement notifié, un
 *  évènement rare) reste négligeable même après plusieurs années — cf.
 *  l'index existant `@@index([action, createdAt])` sur AuditLog. */
async function getLastNotifiedAtByCollaborateur(prisma: PrismaService): Promise<Map<string, Date>> {
  const logs = await prisma.auditLog.findMany({
    where: { action: DEPARTURE_NOTIFIED_ACTION },
    select: { details: true, createdAt: true },
  });

  const lastNotifiedAt = new Map<string, Date>();
  for (const log of logs) {
    const collaborateurId = (log.details as { collaborateurId?: string } | null)?.collaborateurId;
    if (!collaborateurId) continue;
    const existing = lastNotifiedAt.get(collaborateurId);
    if (!existing || log.createdAt > existing) lastNotifiedAt.set(collaborateurId, log.createdAt);
  }
  return lastNotifiedAt;
}

/**
 * Parmi les candidats (inactifs + matériel), ne garde que ceux qu'il faut
 * effectivement notifier : jamais notifiés, ou notifiés lors d'un épisode
 * d'inactivité antérieur.
 *
 * « Épisode d'inactivité » est approximé par `User.updatedAt` : tant qu'un
 * compte reste désactivé, plus aucune synchronisation LDAP ne le touche (le
 * filtre AD par défaut exclut les comptes désactivés de la recherche — cf.
 * ldap.service.ts), donc `updatedAt` reste figé à l'instant de la
 * désactivation. S'il est réactivé puis redésactivé plus tard, `updatedAt`
 * avance à la nouvelle désactivation — postérieure à toute notification
 * précédente — et une nouvelle alerte redevient due, conformément à la
 * décision produit (« si la personne est réactivée puis redésactivée plus
 * tard, une nouvelle alerte est légitime »).
 *
 * Approximation assumée : `updatedAt` peut aussi avancer pour une autre
 * raison qu'une réactivation (changement de rôle, de filiale, de service par
 * un admin...) pendant que le compte reste désactivé, ce qui redéclenchera
 * une alerte pour un départ déjà connu. Il n'existe aucun évènement dédié à
 * la désactivation en base sur lequel s'ancrer plus précisément. Le pire cas
 * reste une notification redondante à propos d'un collaborateur qui détient
 * effectivement encore du matériel — de l'information en trop, jamais fausse
 * — préférable à un silence qui laisserait un vrai départ sans alerte.
 */
function selectDueCandidates(
  candidates: readonly CollaborateurInventoryItem[],
  lastNotifiedAt: ReadonlyMap<string, Date>,
  userUpdatedAt: ReadonlyMap<string, Date>,
): CollaborateurInventoryItem[] {
  return candidates.filter((c) => {
    const notifiedAt = lastNotifiedAt.get(c.collaborateurId);
    if (!notifiedAt) return true;
    const updatedAt = userUpdatedAt.get(c.collaborateurId);
    // updatedAt introuvable (cas théorique) : on notifie plutôt que de risquer
    // un silence permanent.
    if (!updatedAt) return true;
    return notifiedAt < updatedAt;
  });
}

export interface DepartureNotificationDeps {
  prisma: PrismaService;
  logger: Logger;
  /** NotificationService.sendDepartureAlert, injecté par LdapService — évite
   *  de coupler ce module (LDAP) à NestJS DI directement. */
  sendAlert: (candidates: readonly CollaborateurInventoryItem[]) => Promise<boolean>;
}

/**
 * Point d'entrée appelé en fin de synchronisation LDAP (LdapService.syncUsers) :
 * calcule les départs avec matériel non encore notifiés, envoie UN email
 * récapitulatif s'il y en a, puis trace chaque collaborateur notifié dans le
 * journal d'audit pour ne jamais renvoyer deux fois pour la même personne.
 *
 * Ne renvoie rien et ne lève jamais : l'appelant doit néanmoins l'envelopper
 * dans son propre try/catch (défense en profondeur — cf. politique « l'envoi
 * ne doit jamais faire échouer la synchro »).
 */
export async function notifyDepartures(deps: DepartureNotificationDeps, now: Date = new Date()): Promise<void> {
  const { prisma, logger, sendAlert } = deps;

  const candidates = await getInactiveCollaborateurGroups(prisma, now);
  if (candidates.length === 0) return;

  const [lastNotifiedAt, users] = await Promise.all([
    getLastNotifiedAtByCollaborateur(prisma),
    prisma.user.findMany({
      where: { id: { in: candidates.map((c) => c.collaborateurId) } },
      select: { id: true, updatedAt: true },
    }),
  ]);
  const userUpdatedAt = new Map(users.map((u) => [u.id, u.updatedAt]));

  const due = selectDueCandidates(candidates, lastNotifiedAt, userUpdatedAt);
  if (due.length === 0) return;

  const sent = await sendAlert(due);
  if (!sent) {
    // Erreur déjà journalisée par NotificationService.sendDepartureAlert.
    // Aucune trace d'audit écrite : la prochaine synchronisation retentera
    // l'envoi pour ces mêmes collaborateurs (pas de double-échec silencieux).
    logger.warn(`Alerte départ : ${due.length} collaborateur(s) concerné(s), envoi en échec — nouvelle tentative au prochain passage`);
    return;
  }

  for (const c of due) {
    await prisma.auditLog.create({
      data: {
        action: DEPARTURE_NOTIFIED_ACTION,
        details: { collaborateurId: c.collaborateurId, equipmentCount: c.count },
      },
    }).catch((err: unknown) => {
      logger.error(`Audit ${DEPARTURE_NOTIFIED_ACTION} non journalisé pour ${c.collaborateurId}: ${(err as Error).message}`);
    });
  }
  logger.log(`Alerte départ envoyée pour ${due.length} collaborateur(s)`);
}
