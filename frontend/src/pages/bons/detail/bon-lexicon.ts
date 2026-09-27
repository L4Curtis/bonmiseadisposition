import type { BonActionName, BonDetail, EquipmentReturnState, LinkSignatureType } from '@/contracts';
import { DOCUMENT_LABELS, TERMS, WITHOUT_SIGNATURE_ACTION_LABELS, labelOrKey } from '@/domain/labels';

/**
 * Mots du cycle de vie propres à la fiche d'un bon : noms des actions, phrase
 * « à faire maintenant », état d'un équipement. Ils suivent le lexique
 * (domain/labels.ts) et s'y ajouteront quand il sera rouvert ; en attendant,
 * aucun écran de la fiche n'écrit ces mots en dur ailleurs qu'ici.
 */

/** Nom du bouton de chaque action (machine à états du serveur). */
export const BON_ACTION_LABELS: Readonly<Record<BonActionName, string>> = {
  edit: 'Modifier',
  send: 'Envoyer par email',
  send_in_person: 'Faire signer au guichet',
  resend: 'Renvoyer le lien',
  show_in_person_link: 'Faire signer sur place',
  start_restitution: 'Restitution par email',
  restitution_in_person: 'Restitution au guichet',
  undo_return: 'Annuler un marquage « rendu »',
  declare_not_returned: `Déclarer ${TERMS.notReturned}`,
  mark_found: 'Équipement retrouvé',
  handover_without_signature: WITHOUT_SIGNATURE_ACTION_LABELS.handover_without_signature,
  close_without_signature: WITHOUT_SIGNATURE_ACTION_LABELS.closed_without_signature,
  cancel: 'Annuler le bon',
};

/** Nom du bouton dans le contexte du bon : tant qu'aucun lien n'est parti
 *  pour le document en attente (restitution tout juste marquée, par exemple),
 *  « Renvoyer » serait faux : c'est un premier envoi. */
export function actionLabel(action: BonActionName, bon: Pick<BonDetail, 'pendingSignature'>): string {
  if (action === 'resend' && bon.pendingSignature && !bon.pendingSignature.sentAt) return 'Envoyer le lien par email';
  return BON_ACTION_LABELS[action];
}

/** Actions dangereuses : contour rouge foncé, icône, confirmation systématique. */
export const DANGEROUS_ACTIONS: ReadonlySet<BonActionName> = new Set<BonActionName>([
  'cancel', 'close_without_signature', 'handover_without_signature', 'declare_not_returned',
]);

/** Actions rangées d'office dans « Autres actions » (hors action principale). */
export const SECONDARY_ACTIONS: ReadonlySet<BonActionName> = new Set<BonActionName>([
  'edit', 'undo_return', 'mark_found', 'handover_without_signature', 'close_without_signature', 'cancel',
]);

/** Libellé d'un document en attente, dans une phrase (« la remise », « le PV »…). */
const DOCUMENT_IN_SENTENCE: Readonly<Record<LinkSignatureType, string>> = {
  mise_disposition: 'la remise',
  restitution: 'la restitution',
  pv_cloture: TERMS.nonReturnReport.replace(/^PV/, 'le PV'),
};

export function documentInSentence(type: LinkSignatureType): string {
  return DOCUMENT_IN_SENTENCE[type];
}

/** Nom complet d'un document à signer (« bon de restitution »). */
export function documentLabel(type: LinkSignatureType): string {
  return labelOrKey(DOCUMENT_LABELS, type);
}

/** État d'un équipement (colonne « État » de la fiche). */
export const EQUIPMENT_RETURN_STATE_LABELS: Readonly<Record<EquipmentReturnState, string>> = {
  out: 'Chez le collaborateur',
  returned_to_sign: 'Rendu — restitution à signer',
  returned: 'Rendu',
  not_returned: 'Non restitué',
};

/**
 * Phrase « à faire maintenant » : ce que l'équipe informatique doit faire,
 * ou ce qu'elle attend. Lue par le panneau d'action de la fiche.
 */
export function nextStepSentence(bon: Pick<BonDetail, 'status' | 'pendingSignature' | 'subStatus' | 'availableActions'>): string {
  const pending = bon.pendingSignature;
  const primary = bon.availableActions?.find((a) => a.primary)?.action;
  if (bon.status === 'draft') {
    return 'Vérifiez le bon, puis faites-le signer : envoi du lien par email, ou signature au guichet. Votre signature IT sera demandée juste avant.';
  }
  if (pending) {
    const what = documentInSentence(pending.type);
    if (!pending.itSigned) return `Apposez votre signature IT sur ${what}, puis transmettez le lien au collaborateur.`;
    if (!pending.expired) return `Le collaborateur doit signer ${what}. Aucune action n’est nécessaire pour l’instant.`;
    return primary === 'show_in_person_link'
      ? `Aucun lien valide : faites signer ${what} au guichet.`
      : `Aucun lien valide : renvoyez le lien pour ${what}, ou faites signer au guichet.`;
  }
  if (bon.status === 'active') return 'Le matériel est chez le collaborateur. À son retour, lancez la restitution.';
  if (bon.subStatus === 'loss_declared' || bon.subStatus === 'equipment_still_out') {
    return 'Des équipements sont encore chez le collaborateur : lancez leur restitution, ou déclarez-les non restitués.';
  }
  if (bon.status === 'contested') return 'Le collaborateur conteste ce bon : traitez sa contestation depuis la page Contestations.';
  return '';
}
