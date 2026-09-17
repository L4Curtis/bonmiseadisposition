import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body,
  footer,
  infoBox,
  refBadge,
  statusIcon,
} from '../email-layout';
import { CHIP_SUCCESS } from './chips';

// ─── 3. Confirmation mise à disposition ──────────────────────────────────────

export function defaultConfirmationMiseDisposition(): string {
  return emailWrapper(card(
    brandHeader('Signature confirmée', '{{FILIALE_NOM}}', CHIP_SUCCESS),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', 'Type : <strong style="color:#1B1A18">Mise à disposition</strong>']),
    body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 16px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Votre bon de <strong style="color:#1B1A18">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} a bien été <strong style="color:#166534">signé électroniquement</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Ce document est désormais archivé dans notre système. Conservez cet email comme preuve de signature.
      </p>
      ${infoBox('#f0fdf4', '#bbf7d0', '#166534', 'Document archivé de façon sécurisée &middot; Ce bon a valeur contractuelle &middot; Aucune action supplémentaire requise')}
      `),
    footer(),
  ));
}

// ─── 4. Confirmation restitution ─────────────────────────────────────────────

export function defaultConfirmationRestitution(): string {
  return emailWrapper(card(
    brandHeader('Signature confirmée', '{{FILIALE_NOM}}', CHIP_SUCCESS),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', 'Type : <strong style="color:#1B1A18">Restitution</strong>']),
    body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 16px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Votre bon de <strong style="color:#1B1A18">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} a bien été <strong style="color:#166534">signé électroniquement</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Ce document est désormais archivé dans notre système. Conservez cet email comme preuve de signature.
      </p>
      ${infoBox('#f0fdf4', '#bbf7d0', '#166534', 'Document archivé de façon sécurisée &middot; Ce bon a valeur contractuelle &middot; Aucune action supplémentaire requise')}
      `),
    footer(),
  ));
}

// ─── 4b. Confirmation procès-verbal de clôture ───────────────────────────────

export function defaultConfirmationPvCloture(): string {
  return emailWrapper(card(
    brandHeader('Signature confirmée', '{{FILIALE_NOM}}', CHIP_SUCCESS),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', 'Type : <strong style="color:#1B1A18">Procès-verbal de clôture</strong>']),
    body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 16px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Votre <strong style="color:#1B1A18">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} a bien été <strong style="color:#166534">signé électroniquement</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75;text-align:center">
        Ce document est désormais archivé dans notre système. Conservez cet email comme preuve de signature.
      </p>
      ${infoBox('#f0fdf4', '#bbf7d0', '#166534', 'Document archivé de façon sécurisée &middot; Ce document a valeur probante &middot; Aucune action supplémentaire requise')}
      `),
    footer(),
  ));
}
