import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { buildEquipList } from './equipment-lists';
import { civiliteLongOf, filialeNomOf } from './message-parts';
import type { EmailMessage } from './signature-request-messages';

/**
 * Emails d'information au collaborateur : annulation, remise constatée sans
 * signature, clôture sans signature, bon remplacé, équipement retrouvé.
 * Chacun a son modèle personnalisable (templates/defaults/notice-defaults.ts) ;
 * ces fonctions n'en construisent que les variables et le sujet. Chacun dit
 * exactement ce qui s'est passé, avec le motif saisi par l'équipe
 * informatique (échappé : c'est du texte saisi).
 */

/** Variables + sujet + modèle d'un email. */
export interface TemplatedEmail extends EmailMessage {
  templateId: string;
}

/** Variables communes : formule d'appel, référence, filiale. */
function commonVars(bon: NotificationBon): Record<string, string> {
  return {
    COLLAB_CIVILITE: civiliteLongOf(bon),
    COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
    REFERENCE: escapeHtml(bon.reference),
    FILIALE_NOM: escapeHtml(filialeNomOf(bon)),
  };
}

/** Email « bon annulé », avec le motif (R-013). Envoyé quand un lien de
 *  signature avait été transmis au collaborateur. */
export function buildCancellationNotice(bon: NotificationBon, reason: string): TemplatedEmail {
  return {
    templateId: 'bon_cancelled',
    vars: { ...commonVars(bon), REASON: escapeHtml(reason) },
    subject: `[${bon.reference}] Bon annulé`,
  };
}

/** Email « remise constatée sans signature » (R-014) : le bon est désormais
 *  « En cours », les équipements sont attribués au collaborateur. */
export function buildHandoverWithoutSignatureNotice(bon: NotificationBon, reason: string, portalUrl: string): TemplatedEmail {
  return {
    templateId: 'handover_without_signature',
    vars: {
      ...commonVars(bon),
      REASON: escapeHtml(reason),
      EQUIP_LIST: buildEquipList(bon.equipments ?? []),
      PORTAIL_URL: portalUrl,
    },
    subject: `[${bon.reference}] Remise des équipements enregistrée sans votre signature`,
  };
}

/** Étape que la clôture a abandonnée, dite au collaborateur. */
function abandonedStep(previousStatus: string): string {
  if (previousStatus === 'partially_returned') return 'la restitution et le PV de non-restitution';
  if (previousStatus === 'sent_restitution') return 'la restitution';
  return 'le bon';
}

/** Email « bon clôturé sans signature » (R-014) : le bon est « Clôturé ». */
export function buildClosedWithoutSignatureNotice(
  bon: NotificationBon,
  reason: string,
  previousStatus: string,
  portalUrl: string,
): TemplatedEmail {
  return {
    templateId: 'closed_without_signature',
    vars: {
      ...commonVars(bon),
      REASON: escapeHtml(reason),
      ABANDONED_STEP: abandonedStep(previousStatus),
      PORTAIL_URL: portalUrl,
    },
    subject: `[${bon.reference}] Bon clôturé sans votre signature`,
  };
}

/** Email « bon remplacé » : le collaborateur a signé le bon corrigé d'une
 *  contestation Fondée ; le bon contesté est clôturé, remplacé par celui-ci. */
export function buildBonReplacedNotice(bon: NotificationBon, replacementReference: string, portalUrl: string): TemplatedEmail {
  return {
    templateId: 'bon_replaced',
    vars: { ...commonVars(bon), REPLACEMENT_REFERENCE: escapeHtml(replacementReference), PORTAIL_URL: portalUrl },
    subject: `[${bon.reference}] Bon remplacé par ${replacementReference}`,
  };
}

/** Email « équipement(s) retrouvé(s) » pour les équipements listés dans
 *  equipmentIds (parmi ceux du bon), précédemment déclarés non restitués. */
export function buildMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): TemplatedEmail {
  const found = (bon.equipments ?? []).filter((eq) => equipmentIds.includes(eq.id));
  return {
    templateId: 'equipment_found',
    vars: { ...commonVars(bon), FOUND_LIST: buildEquipList(found) },
    subject: `[${bon.reference}] Équipement(s) retrouvé(s)`,
  };
}
