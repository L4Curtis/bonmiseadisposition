import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body,
  footer,
  refBadge,
  quoteBox,
  ctaButton,
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
      ${ctaButton('{{BON_URL}}', 'Ouvrir le bon contest&eacute;')}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Prenez la contestation en charge puis tranchez-la : &laquo;&nbsp;Fond&eacute;e&nbsp;&raquo; (le document est corrig&eacute;, puis renvoy&eacute; &agrave; signer) ou &laquo;&nbsp;Non retenue&nbsp;&raquo;. <a href="{{CONTESTATIONS_URL}}" style="color:#B92A20">Toutes les contestations &agrave; traiter</a>
      </p>
      `),
    footer(),
  ));
}

// ─── 7. Contestation fondée ──────────────────────────────────────────────────

export function defaultContestationResolved(): string {
  return emailWrapper(card(
    brandHeader('Contestation fondée', '{{FILIALE_NOM}}', { text: 'Fondée', bg: 'rgba(255,255,255,0.18)' }),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>']),
    body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été jugée <strong style="color:#166534">fondée</strong> par l’équipe informatique. {{REPLACEMENT_SENTENCE}}
      </p>
      ${sectionLabel('Message de l’équipe informatique')}
      ${quoteBox('#16a34a', '#f0fdf4', '#bbf7d0', '{{RESOLUTION_MESSAGE}}')}
      `),
    footer(),
  ));
}

// ─── 8. Contestation non retenue ─────────────────────────────────────────────

export function defaultContestationRejected(): string {
  return emailWrapper(card(
    brandHeader('Contestation non retenue', '{{FILIALE_NOM}}', CHIP_DANGER('Non retenue')),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>']),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été examinée par l’équipe informatique. Après vérification, elle <strong style="color:#991b1b">n’est pas retenue</strong> : {{REJECTION_SENTENCE}}
      </p>
      ${sectionLabel('Message de l’équipe informatique')}
      ${quoteBox('#dc2626', '#fef2f2', '#fecaca', '{{RESOLUTION_MESSAGE}}')}
      {{SIGN_BUTTON}}
      `),
    footer(),
  ));
}
