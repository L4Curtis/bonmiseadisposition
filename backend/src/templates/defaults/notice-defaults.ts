import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body,
  footer,
  quoteBox,
  sectionLabel,
  equipList,
  refBadge,
  ctaButton,
} from '../email-layout';
import { CHIP_DANGER } from './chips';

// ─── 13 à 19. Emails d'information et alertes (modèles personnalisables) ─────
// Annulation, remise constatée et clôture sans signature, bon remplacé,
// équipement retrouvé (au collaborateur) ; nouveau lien demandé et relance des
// contestations (à l'équipe informatique). Les variables sont construites par
// notification/messages/system-notice-emails.ts, link-request-alert-message.ts
// et templates/contestation-overdue-alert.ts.

const CHIP = (text: string) => ({ text, bg: 'rgba(255,255,255,0.18)' });

const REF_STRIP = metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>']);

const GREETING = '<p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>';

const CONTACT_IT =
  '<p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">Pour toute question, contactez l’équipe informatique.</p>';

function paragraph(html: string): string {
  return `<p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">${html}</p>`;
}

const REASON_BOX = `${sectionLabel('Motif indiqué par l’équipe informatique')}${quoteBox('#d97706', '#fffbeb', '#fde68a', '{{REASON}}')}`;

export function defaultBonCancelled(): string {
  return emailWrapper(card(
    brandHeader('Bon annulé', '{{FILIALE_NOM}}', CHIP('Annulé')),
    REF_STRIP,
    body(`
      ${GREETING}
      ${paragraph(`Le bon de mise à disposition ${refBadge('{{REFERENCE}}')} ({{FILIALE_NOM}}) qui vous avait été envoyé pour signature <strong style="color:#991b1b">a été annulé</strong>. Le lien de signature n’est plus valable et aucune action n’est attendue de votre part.`)}
      ${REASON_BOX}
      ${CONTACT_IT}
      `),
    footer(),
  ));
}

export function defaultHandoverWithoutSignature(): string {
  return emailWrapper(card(
    brandHeader('Remise des équipements enregistrée', '{{FILIALE_NOM}}', CHIP('Remise constatée sans signature')),
    REF_STRIP,
    body(`
      ${GREETING}
      ${paragraph(`L’équipe informatique a enregistré la remise des équipements du bon ${refBadge('{{REFERENCE}}')} ({{FILIALE_NOM}}) <strong style="color:#1B1A18">sans votre signature</strong>. Le bon est désormais <strong style="color:#1B1A18">En cours</strong> : les équipements ci-dessous vous sont attribués.`)}
      ${sectionLabel('Équipements remis')}
      ${equipList('{{EQUIP_LIST}}')}
      ${REASON_BOX}
      ${paragraph('Si ces équipements ne vous ont pas été remis, contactez l’équipe informatique au plus vite.')}
      ${ctaButton('{{PORTAIL_URL}}', 'Voir mes équipements')}
      `),
    footer(),
  ));
}

export function defaultClosedWithoutSignature(): string {
  return emailWrapper(card(
    brandHeader('Bon clôturé', '{{FILIALE_NOM}}', CHIP('Clôturé sans signature')),
    REF_STRIP,
    body(`
      ${GREETING}
      ${paragraph(`Votre signature était attendue pour {{ABANDONED_STEP}} du bon ${refBadge('{{REFERENCE}}')} ({{FILIALE_NOM}}). L’équipe informatique a <strong style="color:#1B1A18">clôturé ce bon sans votre signature</strong> ; il n’y a plus rien à signer.`)}
      ${REASON_BOX}
      ${paragraph('Si vous contestez cette clôture, contactez l’équipe informatique au plus vite.')}
      ${ctaButton('{{PORTAIL_URL}}', 'Voir mes bons')}
      `),
    footer(),
  ));
}

export function defaultBonReplaced(): string {
  return emailWrapper(card(
    brandHeader('Bon remplacé', '{{FILIALE_NOM}}', CHIP('Contestation fondée')),
    REF_STRIP,
    body(`
      ${GREETING}
      ${paragraph(`Suite à votre contestation, vous avez signé le bon corrigé ${refBadge('{{REPLACEMENT_REFERENCE}}')}. Il <strong style="color:#1B1A18">remplace</strong> le bon ${refBadge('{{REFERENCE}}')} ({{FILIALE_NOM}}), désormais clôturé.`)}
      ${ctaButton('{{PORTAIL_URL}}', 'Voir mes bons')}
      ${CONTACT_IT}
      `),
    footer(),
  ));
}

export function defaultEquipmentFound(): string {
  return emailWrapper(card(
    brandHeader('Équipement(s) retrouvé(s)', '{{FILIALE_NOM}}', CHIP('Mise à jour')),
    REF_STRIP,
    body(`
      ${GREETING}
      ${paragraph(`Le ou les équipements suivants, déclarés non restitués sur le bon ${refBadge('{{REFERENCE}}')} ({{FILIALE_NOM}}), ont été <strong style="color:#166534">retrouvés</strong> :`)}
      ${sectionLabel('Équipements retrouvés')}
      ${equipList('{{FOUND_LIST}}', '#f0fdf4', '#bbf7d0')}
      ${CONTACT_IT}
      `),
    footer(),
  ));
}

export function defaultLinkRequestAlert(): string {
  return emailWrapper(card(
    brandHeader('Nouveau lien de signature demandé', '{{FILIALE_NOM}}', CHIP('Action requise')),
    metaStrip([
      'Bon <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>',
      '<strong style="color:#1B1A18">{{DOCUMENT_LABEL}}</strong>',
    ]),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        <strong style="color:#1B1A18">{{COLLAB_NAME}}</strong> ({{REQUESTER_EMAIL}}) a ouvert le lien de signature du
        {{DOCUMENT_LABEL}} ${refBadge('{{REFERENCE}}')}, expiré le {{EXPIRED_AT}},
        et demande un nouveau lien.
      </p>
      <p style="margin:0 0 4px;font-size:15px;color:#4A463F;line-height:1.75">
        Depuis la fiche du bon, renvoyez le document, ou faites-le signer au guichet si le collaborateur ne peut plus recevoir de lien.
      </p>
      ${ctaButton('{{BON_URL}}', 'Ouvrir le bon')}
      `),
    footer(),
  ));
}

export function defaultContestationOverdueAlert(): string {
  return emailWrapper(card(
    brandHeader('Contestations à trancher', 'Relance automatique', CHIP_DANGER('Action requise')),
    metaStrip(['<strong style="color:#1B1A18">{{COUNT}}</strong> en attente depuis plus de {{AFTER_DAYS}} jours ouvrés']),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        {{OVERDUE_LEAD}} une décision depuis plus de {{AFTER_DAYS}} jours ouvrés. Tant qu’elle n’est pas tranchée (« Fondée » ou « Non retenue »), le bon reste bloqué et le collaborateur attend une réponse.
      </p>
      <ul style="margin:0 0 8px;padding:0;list-style:none">{{OVERDUE_LIST}}</ul>
      ${ctaButton('{{CONTESTATIONS_URL}}', 'Ouvrir les contestations à traiter')}
      `),
    footer(),
  ));
}
