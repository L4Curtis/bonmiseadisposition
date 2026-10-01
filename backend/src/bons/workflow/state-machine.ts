import type { BonStatus } from '@prisma/client';
import type { BonActionName, BonAvailableAction, BonSubStatus, LinkSignatureType } from '../../contracts/bons';
import { BonStatusList, isBonStatusIn } from '../bon-status';

/**
 * Machine à états du cycle de vie d'un bon : la SEULE réponse aux questions
 * « que peut-on faire sur ce bon maintenant ? », « quel document attend la
 * signature du collaborateur ? » et « où va le bon après cette étape ? ».
 *
 * Module pur : il ne lit que des faits déjà calculés (`BonFacts`, voir
 * bon-facts.ts). Le serveur s'en sert pour refuser une action hors de son
 * statut, et l'expose à l'écran (`availableActions`, `subStatus`,
 * `pendingSignature` de la fiche) : la fiche n'a plus rien à recalculer.
 *
 *   Brouillon ──envoi / guichet──▶ Remise à signer ──signature──▶ En cours
 *      │                               │  └─ remise constatée sans signature ─▶ En cours
 *      └──────── annulation (motif) ◀──┘
 *   En cours ──marquage « rendu »──▶ Restitution à signer (tout rendu)
 *                                  └▶ Restitution en cours (une partie, ou une perte)
 *   Restitution à signer / en cours ──signature (ou clôture sans signature)──▶ Clôturé
 */

/** Ce que la machine à états sait d'un bon. */
export interface BonFacts {
  readonly status: BonStatus;
  readonly equipmentCount: number;
  /** Encore chez le collaborateur : ni rendus ni déclarés non restitués. */
  readonly equipmentOut: number;
  /** Rendus, restitution pas encore signée par le collaborateur. */
  readonly returnedToSign: number;
  /** Rendus, restitution signée. */
  readonly returnedSigned: number;
  /** Déclarés non restitués. */
  readonly notReturned: number;
  /** Un lien de signature peut être envoyé au collaborateur (canSendLink). */
  readonly canSendLink: boolean;
  /** Message du refus d'envoi quand `canSendLink` est faux. */
  readonly linkRefusalMessage: string | null;
  /** Un lien valide (non expiré, non invalidé) attend la signature du document en cours. */
  readonly hasValidLink: boolean;
}

/** Règle d'une action : statuts de départ, condition sur les équipements,
 *  besoin d'envoyer un email. */
interface ActionRule {
  readonly from: BonStatusList;
  /** Motif du refus si la condition n'est pas remplie, sinon null. */
  readonly guard?: (facts: BonFacts) => string | null;
  /** L'action envoie un lien par email : elle suit la règle canSendLink. */
  readonly sendsEmail?: boolean;
}

function list(...statuses: BonStatus[]): BonStatusList {
  return Object.freeze(statuses);
}

const NOTHING_TO_SIGN = 'Aucun document n’attend la signature du collaborateur.';
const NO_EQUIPMENT_OUT = 'Aucun équipement n’est encore chez le collaborateur.';

const needsPendingDocument = (f: BonFacts) => (pendingDocument(f) ? null : NOTHING_TO_SIGN);
const needsEquipmentOut = (f: BonFacts) => (f.equipmentOut > 0 ? null : NO_EQUIPMENT_OUT);

/**
 * Table des actions : statut de départ → condition. Le statut d'arrivée est
 * calculé après l'action par `statusAfterReturnChange` (restitution,
 * annulation d'un marquage, équipement retrouvé) ou fixé par l'action
 * elle-même (voir chaque workflow).
 */
export const BON_ACTION_RULES: Readonly<Record<BonActionName, ActionRule>> = Object.freeze({
  edit: { from: list('draft', 'sent_mise_dispo') },
  send: { from: list('draft'), sendsEmail: true },
  send_in_person: { from: list('draft') },
  cancel: { from: list('draft', 'sent_mise_dispo') },
  handover_without_signature: { from: list('sent_mise_dispo') },
  resend: {
    from: list('sent_mise_dispo', 'sent_restitution', 'partially_returned'),
    guard: needsPendingDocument,
    sendsEmail: true,
  },
  show_in_person_link: {
    from: list('sent_mise_dispo', 'sent_restitution', 'partially_returned'),
    guard: needsPendingDocument,
  },
  start_restitution: { from: list('active', 'partially_returned'), guard: needsEquipmentOut, sendsEmail: true },
  restitution_in_person: { from: list('active', 'partially_returned'), guard: needsEquipmentOut },
  undo_return: {
    from: list('sent_restitution', 'partially_returned'),
    guard: (f) => (f.returnedToSign > 0 ? null : 'Aucun équipement marqué rendu n’attend de signature.'),
  },
  declare_not_returned: { from: list('active', 'partially_returned'), guard: needsEquipmentOut },
  mark_found: {
    from: list('partially_returned', 'archived'),
    guard: (f) => (f.notReturned > 0 ? null : 'Aucun équipement n’est déclaré non restitué.'),
  },
  close_without_signature: {
    from: list('sent_restitution', 'partially_returned'),
    guard: (f) => {
      if (f.equipmentOut > 0) {
        return 'Des équipements sont encore chez le collaborateur : faites-les restituer ou déclarez-les non restitués avant de clôturer.';
      }
      return needsPendingDocument(f);
    },
  },
});

/** Ordre d'affichage des actions (l'action principale passe devant). */
export const BON_ACTION_ORDER: readonly BonActionName[] = Object.freeze([
  'send', 'send_in_person', 'resend', 'show_in_person_link', 'start_restitution', 'restitution_in_person',
  'undo_return', 'declare_not_returned', 'mark_found', 'edit', 'handover_without_signature',
  'close_without_signature', 'cancel',
] as BonActionName[]);

// ─── Lecture de l'état ───────────────────────────────────────────────────────

/** Document qui attend la signature du collaborateur, déduit des équipements
 *  (jamais de l'existence d'une ligne de signature, que la purge supprime). */
export function pendingDocument(f: BonFacts): LinkSignatureType | null {
  if (f.status === 'sent_mise_dispo') return 'mise_disposition';
  if (f.status === 'sent_restitution') return 'restitution';
  if (f.status !== 'partially_returned') return null;
  if (f.returnedToSign > 0) return 'restitution';
  if (f.equipmentOut === 0 && f.notReturned > 0) return 'pv_cloture';
  return null;
}

/** Sous-état de « Restitution en cours » ; null pour les autres statuts.
 *  Les quatre cas s'excluent : la restitution à signer passe avant le PV, qui
 *  ne part qu'une fois tout le reste signé. */
export function subStatus(f: BonFacts): BonSubStatus | null {
  if (f.status !== 'partially_returned') return null;
  if (f.returnedToSign > 0) return 'partial_restitution_to_sign';
  if (f.equipmentOut === 0 && f.notReturned > 0) return 'pv_to_sign';
  if (f.notReturned > 0) return 'loss_declared';
  return 'equipment_still_out';
}

/** Motif du refus d'une action, ou null si elle est permise maintenant. */
export function actionBlockedReason(action: BonActionName, f: BonFacts): string | null {
  const rule = BON_ACTION_RULES[action];
  if (!isBonStatusIn(f.status, rule.from)) return statusRefusal(action, f.status);
  const guardReason = rule.guard?.(f) ?? null;
  if (guardReason) return guardReason;
  if (rule.sendsEmail && !f.canSendLink) return f.linkRefusalMessage ?? 'Aucun lien ne peut être envoyé au collaborateur.';
  return null;
}

/** L'action est-elle possible depuis ce statut (quelles que soient ses
 *  autres conditions) ? Sert à ne proposer que ce qui a un sens. */
export function isActionInScope(action: BonActionName, f: BonFacts): boolean {
  const rule = BON_ACTION_RULES[action];
  return isBonStatusIn(f.status, rule.from) && (rule.guard?.(f) ?? null) === null;
}

const STATUS_REFUSALS: Readonly<Partial<Record<BonActionName, string>>> = Object.freeze({
  edit: 'Seuls un brouillon ou un bon envoyé mais pas encore signé peuvent être modifiés.',
  send: 'Seul un brouillon peut être envoyé.',
  send_in_person: 'Seul un brouillon peut être remis au guichet.',
  cancel: 'Un bon ne peut plus être annulé une fois la remise signée.',
  handover_without_signature: 'La remise sans signature ne se constate que sur un bon « Remise à signer ».',
  start_restitution: 'La restitution ne se lance que sur un bon « En cours » ou « Restitution en cours ».',
  restitution_in_person: 'La restitution ne se lance que sur un bon « En cours » ou « Restitution en cours ».',
  declare_not_returned: 'Un équipement ne se déclare non restitué que sur un bon « En cours » ou « Restitution en cours ».',
  close_without_signature: 'La clôture sans signature ne concerne qu’une restitution ou un PV à signer.',
});

/** Un bon annulé n'accepte plus rien : on le dit tel quel, plutôt que la
 *  règle de l'action (« … une fois la remise signée » serait faux). */
const CANCELLED_REFUSAL = 'Ce bon est annulé : plus aucune action n’est possible.';

function statusRefusal(action: BonActionName, status: BonFacts['status']): string {
  if (status === 'cancelled') return CANCELLED_REFUSAL;
  return STATUS_REFUSALS[action] ?? 'Cette action n’est pas possible dans l’état actuel du bon.';
}

/**
 * Contexte de la fiche que les équipements ne disent pas. `correction` : une
 * contestation Fondée a rouvert ce document (restitution ou PV) et rien n'a
 * encore été corrigé (voir bon-it-notices.ts) — il faut corriger avant de
 * relancer la signature, sinon on renverrait le même document faux.
 */
export interface BonActionContext {
  readonly correction?: LinkSignatureType | null;
}

/** Geste de correction proposé en premier pour chaque document rouvert. */
const CORRECTION_ACTIONS: Readonly<Partial<Record<LinkSignatureType, BonActionName>>> = Object.freeze({
  restitution: 'undo_return',
  pv_cloture: 'mark_found',
});

/** Action recommandée : ce que l'équipe informatique a à faire maintenant,
 *  ou null quand il suffit d'attendre (lien valide chez le collaborateur,
 *  prêt en cours). */
export function primaryAction(f: BonFacts, context: BonActionContext = {}): BonActionName | null {
  if (f.status === 'draft') return f.canSendLink ? 'send' : 'send_in_person';
  const document = pendingDocument(f);
  if (document) {
    const correction = context.correction === document ? CORRECTION_ACTIONS[document] : undefined;
    if (correction && actionBlockedReason(correction, f) === null) return correction;
    if (f.hasValidLink) return null;
    return f.canSendLink ? 'resend' : 'show_in_person_link';
  }
  if (f.status === 'partially_returned') return f.canSendLink ? 'start_restitution' : 'restitution_in_person';
  return null;
}

/**
 * Actions proposées sur la fiche : celles qui ont un sens dans ce statut, avec
 * le motif qui en bloque certaines (un envoi par email vers un compte
 * désactivé, par exemple), l'action principale en tête.
 */
export function availableActions(f: BonFacts, context: BonActionContext = {}): BonAvailableAction[] {
  const primary = primaryAction(f, context);
  const actions = BON_ACTION_ORDER.filter((action) => isActionInScope(action, f)).map((action) => ({
    action,
    primary: action === primary,
    blockedReason: actionBlockedReason(action, f),
  }));
  return [...actions.filter((a) => a.primary), ...actions.filter((a) => !a.primary)];
}

// ─── Statut suivant ──────────────────────────────────────────────────────────

/** Comptes d'équipements après un changement de restitution (marquage,
 *  annulation d'un marquage, équipement retrouvé). */
export type ReturnCounts = Pick<BonFacts, 'equipmentCount' | 'equipmentOut' | 'returnedToSign' | 'notReturned'>;

/**
 * Statut d'un bon prêté après un changement de ses équipements :
 *  - rien n'est rendu ni déclaré : « En cours » ;
 *  - tout est rendu (plus rien dehors, aucune perte) et une partie attend sa
 *    signature : « Restitution à signer » ;
 *  - sinon : « Restitution en cours ».
 */
export function statusAfterReturnChange(counts: ReturnCounts): BonStatus {
  if (counts.equipmentOut === counts.equipmentCount) return 'active';
  if (counts.equipmentOut === 0 && counts.notReturned === 0 && counts.returnedToSign > 0) return 'sent_restitution';
  return 'partially_returned';
}

/** Transitions déclenchées par la signature du collaborateur. */
const SIGNATURE_TRANSITIONS: Readonly<Record<LinkSignatureType, { from: BonStatusList; to: BonStatus }>> =
  Object.freeze({
    mise_disposition: { from: list('sent_mise_dispo'), to: 'active' },
    restitution: { from: list('sent_restitution', 'partially_returned'), to: 'archived' },
    pv_cloture: { from: list('partially_returned'), to: 'archived' },
  });

/**
 * Statut du bon après la signature d'un document par le collaborateur, ou
 * null si la signature ne fait pas avancer ce statut (transition invalide).
 *
 * Une restitution ne clôture le bon que si elle termine tout : signée depuis
 * « Restitution en cours », ou alors qu'un équipement est déclaré non
 * restitué, le bon reste « Restitution en cours » et le PV de
 * non-restitution suit (c'est le document qui acte la perte).
 */
export function statusAfterSignature(
  status: BonStatus,
  document: LinkSignatureType,
  hasNotReturnedEquipment: boolean,
): BonStatus | null {
  const transition = SIGNATURE_TRANSITIONS[document];
  if (!isBonStatusIn(status, transition.from)) return null;
  if (document === 'restitution' && (status === 'partially_returned' || hasNotReturnedEquipment)) {
    return 'partially_returned';
  }
  return transition.to;
}

/** Vrai si le bon n'attend plus aucune signature du collaborateur après ce
 *  statut : l'horloge `awaitingSince` s'arrête. */
export function stopsAwaiting(status: BonStatus): boolean {
  return status === 'active' || status === 'archived' || status === 'cancelled';
}
