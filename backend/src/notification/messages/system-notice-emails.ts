import { NotificationBon } from '../../common/types';
import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body as emailBody,
  footer,
  quoteBox,
  sectionLabel,
  equipList,
  refBadge,
  ctaButton,
} from '../../templates/email-layout';
import { escapeHtml } from './escape-html';
import { buildEquipList } from './equipment-lists';
import { civiliteLongOf, filialeNomOf } from './message-parts';

/**
 * Emails d'information au collaborateur, construits directement (pas de
 * modèle personnalisable) : annulation, remise constatée sans signature,
 * clôture sans signature, équipement retrouvé. Chacun dit exactement ce qui
 * s'est passé, avec le motif saisi par l'équipe informatique.
 */

export interface SystemNoticeEmail {
  html: string;
  subject: string;
}

const CHIP = { bg: 'rgba(255,255,255,0.18)' };
const CONTACT_IT =
  '<p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">Pour toute question, contactez l’équipe informatique.</p>';

function refStrip(bon: NotificationBon): string {
  return metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]);
}

function greeting(bon: NotificationBon): string {
  const salutation = [civiliteLongOf(bon), bon.collaborateur?.displayName ?? ''].filter(Boolean).join(' ');
  return `<p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(salutation || 'Bonjour')},</p>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">${html}</p>`;
}

function reasonBox(reason: string): string {
  return `${sectionLabel('Motif indiqué par l’équipe informatique')}${quoteBox('#d97706', '#fffbeb', '#fde68a', escapeHtml(reason))}`;
}

/** Email « bon annulé », avec le motif (R-013). Envoyé quand un lien de
 *  signature avait été transmis au collaborateur. */
export function buildCancellationNotice(bon: NotificationBon, reason: string): SystemNoticeEmail {
  const filialeNom = escapeHtml(filialeNomOf(bon));
  const html = emailWrapper(card(
    brandHeader('Bon annulé', filialeNom, { text: 'Annulé', ...CHIP }),
    refStrip(bon),
    emailBody(`
      ${greeting(bon)}
      ${paragraph(`Le bon de mise à disposition ${refBadge(escapeHtml(bon.reference))} (${filialeNom}) qui vous avait été envoyé pour signature <strong style="color:#991b1b">a été annulé</strong>. Le lien de signature n’est plus valable et aucune action n’est attendue de votre part.`)}
      ${reasonBox(reason)}
      ${CONTACT_IT}
      `),
    footer(),
  ));
  return { html, subject: `[${bon.reference}] Bon annulé` };
}

/** Email « remise constatée sans signature » (R-014) : le bon est désormais
 *  « En cours », les équipements sont attribués au collaborateur. */
export function buildHandoverWithoutSignatureNotice(bon: NotificationBon, reason: string, portalUrl: string): SystemNoticeEmail {
  const filialeNom = escapeHtml(filialeNomOf(bon));
  const html = emailWrapper(card(
    brandHeader('Remise des équipements enregistrée', filialeNom, { text: 'Remise constatée sans signature', ...CHIP }),
    refStrip(bon),
    emailBody(`
      ${greeting(bon)}
      ${paragraph(`L’équipe informatique a enregistré la remise des équipements du bon ${refBadge(escapeHtml(bon.reference))} (${filialeNom}) <strong style="color:#1B1A18">sans votre signature</strong>. Le bon est désormais <strong style="color:#1B1A18">En cours</strong> : les équipements ci-dessous vous sont attribués.`)}
      ${sectionLabel('Équipements remis')}
      ${equipList(buildEquipList(bon.equipments ?? []))}
      ${reasonBox(reason)}
      ${paragraph('Si ces équipements ne vous ont pas été remis, contactez l’équipe informatique au plus vite.')}
      ${ctaButton(portalUrl, 'Voir mes équipements')}
      `),
    footer(),
  ));
  return { html, subject: `[${bon.reference}] Remise des équipements enregistrée sans votre signature` };
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
): SystemNoticeEmail {
  const filialeNom = escapeHtml(filialeNomOf(bon));
  const html = emailWrapper(card(
    brandHeader('Bon clôturé', filialeNom, { text: 'Clôturé sans signature', ...CHIP }),
    refStrip(bon),
    emailBody(`
      ${greeting(bon)}
      ${paragraph(`Votre signature était attendue pour ${abandonedStep(previousStatus)} du bon ${refBadge(escapeHtml(bon.reference))} (${filialeNom}). L’équipe informatique a <strong style="color:#1B1A18">clôturé ce bon sans votre signature</strong> ; il n’y a plus rien à signer.`)}
      ${reasonBox(reason)}
      ${paragraph('Si vous contestez cette clôture, contactez l’équipe informatique au plus vite.')}
      ${ctaButton(portalUrl, 'Voir mes bons')}
      `),
    footer(),
  ));
  return { html, subject: `[${bon.reference}] Bon clôturé sans votre signature` };
}

/** Email « bon remplacé » : le collaborateur a signé le bon corrigé d'une
 *  contestation Fondée ; le bon contesté est clôturé, remplacé par celui-ci. */
export function buildBonReplacedNotice(bon: NotificationBon, replacementReference: string, portalUrl: string): SystemNoticeEmail {
  const filialeNom = escapeHtml(filialeNomOf(bon));
  const html = emailWrapper(card(
    brandHeader('Bon remplacé', filialeNom, { text: 'Contestation fondée', ...CHIP }),
    refStrip(bon),
    emailBody(`
      ${greeting(bon)}
      ${paragraph(`Suite à votre contestation, vous avez signé le bon corrigé ${refBadge(escapeHtml(replacementReference))}. Il <strong style="color:#1B1A18">remplace</strong> le bon ${refBadge(escapeHtml(bon.reference))} (${filialeNom}), désormais clôturé.`)}
      ${ctaButton(portalUrl, 'Voir mes bons')}
      ${CONTACT_IT}
      `),
    footer(),
  ));
  return { html, subject: `[${bon.reference}] Bon remplacé par ${replacementReference}` };
}

/** Email « équipement(s) retrouvé(s) » pour les équipements listés dans
 *  equipmentIds (parmi ceux du bon), précédemment déclarés non restitués. */
export function buildMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): SystemNoticeEmail {
  const filialeNom = escapeHtml(filialeNomOf(bon));
  const found = (bon.equipments ?? []).filter((eq) => equipmentIds.includes(eq.id));
  const html = emailWrapper(card(
    brandHeader('Équipement(s) retrouvé(s)', filialeNom, { text: 'Mise à jour', ...CHIP }),
    refStrip(bon),
    emailBody(`
      ${greeting(bon)}
      ${paragraph(`Le ou les équipements suivants, déclarés non restitués sur le bon ${refBadge(escapeHtml(bon.reference))} (${filialeNom}), ont été <strong style="color:#166534">retrouvés</strong> :`)}
      ${sectionLabel('Équipements retrouvés')}
      ${equipList(buildEquipList(found), '#f0fdf4', '#bbf7d0')}
      ${CONTACT_IT}
      `),
    footer(),
  ));
  return { html, subject: `[${bon.reference}] Équipement(s) retrouvé(s)` };
}
