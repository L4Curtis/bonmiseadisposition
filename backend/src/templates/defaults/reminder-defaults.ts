import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body,
  footer,
  ctaButton,
  infoBox,
  equipList,
  sectionLabel,
  refBadge,
} from '../email-layout';
import { CHIP_WARNING } from './chips';

// ─── 9. Rappel signature ─────────────────────────────────────────────────────

export function defaultReminder(): string {
  return emailWrapper(card(
    brandHeader('Document en attente de votre signature', '{{FILIALE_NOM}}', CHIP_WARNING('Rappel {{REMINDER_NUMBER}}/{{MAX_REMINDERS}}')),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', 'Rappel <strong style="color:#1B1A18">{{REMINDER_NUMBER}}/{{MAX_REMINDERS}}</strong>']),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        Ce message est un rappel automatique. Votre bon de <strong style="color:#1B1A18">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} est toujours en attente de votre signature.
      </p>
      <p style="margin:0 0 4px;font-size:15px;color:#4A463F;line-height:1.75">
        Merci de signer ce document dès que possible. Sans signature, le traitement de votre dossier ne pourra pas être finalisé par le service informatique de <strong style="color:#1B1A18">{{FILIALE_NOM}}</strong>.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le document maintenant')}
      ${infoBox('#fff7ed', '#fed7aa', '#c2410c', 'Rappel {{REMINDER_NUMBER}}/{{MAX_REMINDERS}} &middot; <strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise')}
      `),
    footer(),
  ));
}

// ─── 10. Rappel restitution prévue ───────────────────────────────────────────
// Contrairement aux autres rappels, ce template ne porte PAS de lien de
// signature (aucune action de signature n'est attendue à ce stade) : il
// n'est donc pas ajouté à SIGNER_URL_REQUIRED_TEMPLATES.

export function defaultRestitutionDueReminder(): string {
  return emailWrapper(card(
    brandHeader('Restitution de matériel à prévoir', '{{FILIALE_NOM}}', CHIP_WARNING('Rappel')),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', 'Restitution prévue le <strong style="color:#1B1A18">{{DATE_RESTITUTION}}</strong>']),
    body(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75">
        Nous vous rappelons que la date de restitution prévue de votre matériel mis à disposition par <strong style="color:#1B1A18">{{FILIALE_NOM}}</strong> est fixée au <strong style="color:#1B1A18">{{DATE_RESTITUTION}}</strong>, dans le cadre du bon ${refBadge('{{REFERENCE}}')}.
      </p>
      ${sectionLabel('Équipements encore en votre possession')}
      ${equipList('{{EQUIP_LIST}}')}
      <p style="margin:0 0 4px;font-size:15px;color:#4A463F;line-height:1.75">
        Merci de vous rapprocher du service informatique afin d'organiser la restitution de ce matériel avant cette date.
      </p>
      ${ctaButton('{{PORTAIL_URL}}', 'Accéder à mon espace')}
      ${infoBox('#fff7ed', '#fed7aa', '#c2410c', "Message automatique &middot; Aucune signature n'est requise à ce stade &middot; Contactez le service informatique pour toute question")}
      `),
    footer(),
  ));
}
