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
} from '../email-layout';
import { CHIP_ACTION, CHIP_DANGER } from './chips';

// ─── 1. Mise à disposition ───────────────────────────────────────────────────

export function defaultMiseDisposition(): string {
  return emailWrapper(card(
    brandHeader('Équipements mis à votre disposition', '{{FILIALE_NOM}}', CHIP_ACTION),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', 'Remise le <strong style="color:#1B1A18">{{DATE_MISE_DISPO}}</strong>']),
    body(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75">
        Dans le cadre de votre activité au sein de <strong style="color:#1B1A18">{{FILIALE_NOM}}</strong>, le service informatique met à votre disposition les équipements ci-dessous à compter du <strong style="color:#1B1A18">{{DATE_MISE_DISPO}}</strong>.
      </p>
      ${sectionLabel('Équipements remis')}
      ${equipList('{{EQUIP_LIST}}')}
      <p style="margin:0 0 4px;font-size:15px;color:#4A463F;line-height:1.75">
        Veuillez prendre connaissance de cette liste et signer électroniquement le bon de mise à disposition pour confirmer la réception de votre matériel.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le bon de mise à disposition')}
      ${infoBox('#F6F3EE', '#E2DFD9', '#6B665E', '<strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise &middot; La signature électronique a valeur légale')}
      `),
    footer(),
  ));
}

// ─── 2. Restitution ──────────────────────────────────────────────────────────

export function defaultRestitution(): string {
  return emailWrapper(card(
    brandHeader('Restitution de matériel', '{{FILIALE_NOM}}', CHIP_ACTION),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>']),
    body(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75">
        Le service informatique de <strong style="color:#1B1A18">{{FILIALE_NOM}}</strong> vous invite à signer le bon de <strong style="color:#1B1A18">restitution</strong> pour le matériel suivant. Ce document atteste la restitution des équipements listés ci-dessous.
      </p>
      ${sectionLabel('Équipements restitués')}
      ${equipList('{{EQUIP_LIST}}')}
      {{REMAINING_SECTION}}
      <p style="margin:0 0 4px;font-size:15px;color:#4A463F;line-height:1.75">
        Après signature, vous en recevrez une confirmation par email.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le bon de restitution')}
      ${infoBox('#F6F3EE', '#E2DFD9', '#6B665E', '<strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise &middot; La signature électronique a valeur légale')}
      `),
    footer(),
  ));
}

// ─── 5. PV clôture ───────────────────────────────────────────────────────────

export function defaultPvCloture(): string {
  return emailWrapper(card(
    brandHeader('Procès-verbal d\'équipements non restitués', '{{FILIALE_NOM}}', CHIP_DANGER('Action requise')),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>']),
    body(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75">
        Le service informatique de <strong style="color:#1B1A18">{{FILIALE_NOM}}</strong> a constaté que les équipements ci-dessous n'ont pas été restitués dans le cadre du bon <strong style="color:#1B1A18">{{REFERENCE}}</strong>. Un procès-verbal a été établi et nécessite votre signature.
      </p>
      ${sectionLabel('Équipements non restitués')}
      ${equipList('{{NOT_RETURNED_LIST}}', '#fef2f2', '#fecaca')}
      <p style="margin:0 0 4px;font-size:15px;color:#4A463F;line-height:1.75">
        Veuillez signer ce procès-verbal électroniquement. En cas de désaccord, vous pourrez formuler une contestation depuis votre espace collaborateur.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le procès-verbal')}
      ${infoBox('#fef2f2', '#fecaca', '#991b1b', '<strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise &middot; Contestation possible depuis votre espace')}
      `),
    footer(),
  ));
}
