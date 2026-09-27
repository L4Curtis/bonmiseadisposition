import { Prisma } from '@prisma/client';
import type { BonLateness, LinkRefusal } from '../contracts/bons';
import { BON_SELECT_SHAPE, SIGNATURE_SAFE_SELECT } from '../common/types';
import { parisDaysSince } from '../common/dates/paris';
import { canSendLink } from '../common/can-send-link';
import { computeBonFacts, computePendingSignature, equipmentReturnState, lastSignedRestitutionAt } from './workflow/bon-facts';
import { availableActions, BonFacts, pendingDocument, subStatus } from './workflow/state-machine';
import type { BonItNotices } from './bon-it-notices';

/**
 * Fiche d'un bon telle que l'API la renvoie : les colonnes du bon, plus ce que
 * le serveur calcule avec la machine à états (sous-état, document en attente,
 * actions possibles, retards, état de chaque équipement). L'écran affiche ces
 * champs tels quels, sans rien recalculer.
 *
 * Deux lecteurs : l'équipe informatique voit tout ; le collaborateur titulaire
 * ne reçoit jamais la « Note interne IT », le refus d'envoi ni les actions
 * (champs `BonItOnlyField` du contrat).
 */

/** Signature de la fiche : champs publiables, plus l'invalidation et le
 *  mandataire (affichage « au guichet, en présence de … »). */
export const BON_SIGNATURE_SELECT = {
  ...SIGNATURE_SAFE_SELECT,
  invalidatedAt: true,
  invalidatedReason: true,
  signedByProxy: true,
} as const;

/** Select de la fiche : le select canonique, plus les colonnes de la vague 2
 *  et ce qu'il faut pour calculer l'état (compte actif du collaborateur). */
export const BON_DETAIL_SELECT = {
  select: {
    ...BON_SELECT_SHAPE.select,
    internalNote: true,
    awaitingSince: true,
    cancellationReason: true,
    handoverWithoutSignatureReason: true,
    closedWithoutSignatureReason: true,
    replacesBon: { select: { id: true, reference: true } },
    replacedBy: { select: { id: true, reference: true } },
    collaborateur: {
      select: { id: true, displayName: true, email: true, department: true, civilite: true, active: true },
    },
    signatures: { select: BON_SIGNATURE_SELECT, orderBy: { createdAt: 'asc' as const } },
  },
} satisfies { select: Prisma.BonSelect };

export type BonDetailRow = Prisma.BonGetPayload<typeof BON_DETAIL_SELECT>;

/** Qui lit la fiche. */
export type BonViewer = 'it' | 'holder';

/** Seuil de « Signature en retard » (jours), réglage `signature_overdue_days`. */
export interface BonViewOptions {
  readonly viewer: BonViewer;
  readonly signatureOverdueDays: number;
  readonly now?: Date;
  /** Rappels de la fiche IT (contestation, demande de nouveau lien), lus à
   *  part (voir bon-it-notices.ts) ; absents : aucun rappel. */
  readonly notices?: BonItNotices;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Retards d'un bon. La signature se mesure depuis la demande en cours
 *  (`awaitingSince`, à défaut la dernière activité pour un bon d'avant la
 *  colonne) ; le retour, depuis la date de restitution prévue. */
export function computeLateness(
  bon: { awaitingSince: Date | null; updatedAt: Date; dateRestitution: Date | null },
  facts: BonFacts,
  thresholdDays: number,
  now: Date,
): BonLateness {
  let signatureDays: number | null = null;
  if (pendingDocument(facts)) {
    const since = bon.awaitingSince ?? bon.updatedAt;
    const days = Math.floor((now.getTime() - since.getTime()) / MS_PER_DAY);
    signatureDays = days > thresholdDays ? days : null;
  }
  let returnDays: number | null = null;
  if (bon.dateRestitution && facts.equipmentOut > 0 && ['active', 'partially_returned'].includes(facts.status)) {
    const days = parisDaysSince(bon.dateRestitution, now);
    returnDays = days > 0 ? days : null;
  }
  return { signatureDays, returnDays };
}

function linkRefusalOf(collaborateur: { active: boolean; email: string | null }): LinkRefusal | null {
  const result = canSendLink(collaborateur);
  return result.allowed ? null : { reason: result.reason, message: result.message };
}

/** Transforme une ligne de la base en fiche du contrat (`BonDetail`). */
export function presentBonDetail(bon: BonDetailRow, options: BonViewOptions) {
  const now = options.now ?? new Date();
  const facts = computeBonFacts(bon, now.getTime());
  const signedRestitutionAt = lastSignedRestitutionAt(bon.signatures);
  const { replacesBon, collaborateur, equipments, internalNote, ...columns } = bon;
  const { active, ...collaborateurFields } = collaborateur;
  const shared = {
    ...columns,
    collaborateur: collaborateurFields,
    equipments: equipments.map((e) => ({ ...e, returnState: equipmentReturnState(e, signedRestitutionAt, bon.status) })),
    subStatus: subStatus(facts),
    pendingSignature: computePendingSignature(bon, facts, now.getTime()),
    replaces: replacesBon,
    lateness: computeLateness(bon, facts, options.signatureOverdueDays, now),
    collaborateurActive: active,
  };
  if (options.viewer === 'holder') return shared;
  const contestation = options.notices?.contestation ?? null;
  const correction = contestation?.stage === 'correction' ? contestation.contestedDocument : null;
  return {
    ...shared,
    internalNote,
    linkRefusal: linkRefusalOf(collaborateur),
    availableActions: availableActions(facts, { correction }),
    contestation,
    linkRequest: options.notices?.linkRequest ?? null,
  };
}

export type BonDetailView = ReturnType<typeof presentBonDetail>;
