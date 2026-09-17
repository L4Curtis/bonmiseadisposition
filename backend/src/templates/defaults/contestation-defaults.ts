import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body,
  footer,
  refBadge,
  quoteBox,
  sectionLabel,
  statusIcon,
} from '../email-layout';
import { CHIP_DANGER } from './chips';

// ─── 6. Alerte contestation ───────────────────────────────────────────────────

export function defaultContestationAlert(): string {
  return emailWrapper(card(
    brandHeader('Contestation reçue', 'Un collaborateur conteste son bon', CHIP_DANGER('Action requise')),
    metaStrip(['Bon <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', '<strong style="color:#1B1A18">{{FILIALE_NOM}}</strong>']),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        Le collaborateur <strong style="color:#1B1A18">{{USER_NAME}}</strong> a soumis une contestation concernant le bon ${refBadge('{{REFERENCE}}')} de <strong style="color:#1B1A18">{{FILIALE_NOM}}</strong>.
      </p>
      ${sectionLabel('Motif de la contestation')}
      ${quoteBox('#dc2626', '#fef2f2', '#fecaca', '<em>&ldquo;{{CONTESTATION_MESSAGE}}&rdquo;</em>')}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Connectez-vous &agrave; l&rsquo;application pour consulter le bon concern&eacute; et apporter une r&eacute;ponse au collaborateur.
      </p>
      `),
    footer(),
  ));
}

// ─── 7. Contestation retenue ─────────────────────────────────────────────────

export function defaultContestationResolved(): string {
  return emailWrapper(card(
    brandHeader('Contestation prise en compte', '{{FILIALE_NOM}}', { text: 'Acceptée', bg: 'rgba(255,255,255,0.18)' }),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>']),
    body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été <strong style="color:#166534">examinée et prise en compte</strong> par le service informatique.
      </p>
      ${sectionLabel('Message du service IT')}
      ${quoteBox('#16a34a', '#f0fdf4', '#bbf7d0', '{{RESOLUTION_MESSAGE}}')}
      `),
    footer(),
  ));
}

// ─── 8. Contestation rejetée ─────────────────────────────────────────────────

export function defaultContestationRejected(): string {
  return emailWrapper(card(
    brandHeader('Contestation non retenue', '{{FILIALE_NOM}}', CHIP_DANGER('Non retenue')),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>']),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été examinée par le service informatique. Après vérification, elle <strong style="color:#991b1b">n'a pas pu être retenue</strong>.
      </p>
      ${sectionLabel('Message du service IT')}
      ${quoteBox('#dc2626', '#fef2f2', '#fecaca', '{{RESOLUTION_MESSAGE}}')}
      `),
    footer(),
  ));
}
