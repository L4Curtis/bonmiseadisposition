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
  sectionLabel,
  equipList,
  ctaButton,
} from '../email-layout';
import { CHIP_SUCCESS } from './chips';

// ─── Confirmations de signature (R-036) ─────────────────────────────────────
// Même gabarit pour les trois documents : le document signé, ses équipements,
// un lien vers le portail. Le PDF signé est joint à l'email quand sa taille
// le permet (notification/listeners), le texte n'y fait donc qu'allusion.

/** `restitutionSections` : une restitution rappelle à part ce qui avait été
 *  rendu avant et ce qui reste chez le collaborateur (comme le PDF). */
function confirmation(typeText: string, equipmentsTitle: string, legalText: string, restitutionSections = false): string {
  return emailWrapper(card(
    brandHeader('Signature confirmée', '{{FILIALE_NOM}}', CHIP_SUCCESS),
    metaStrip(['Réf. <strong style="color:#1B1A18;font-family:monospace">{{REFERENCE}}</strong>', `Document : <strong style="color:#1B1A18">${typeText}</strong>`]),
    body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        Votre signature du <strong style="color:#1B1A18">{{DOCUMENT_LABEL}}</strong> ${refBadge('{{REFERENCE}}')} est bien enregistrée. Le document signé est joint à cet email et reste consultable dans votre espace.
      </p>
      ${sectionLabel(equipmentsTitle)}
      ${equipList('{{EQUIP_LIST}}')}
      ${restitutionSections ? '{{ALREADY_RETURNED_SECTION}}{{REMAINING_SECTION}}' : ''}
      ${ctaButton('{{PORTAIL_URL}}', 'Voir mes bons et mes équipements')}
      ${infoBox('#f0fdf4', '#bbf7d0', '#166534', legalText)}
      `),
    footer(),
  ));
}

export function defaultConfirmationMiseDisposition(): string {
  return confirmation(
    'Mise à disposition',
    'Équipements mis à votre disposition',
    'Signature électronique enregistrée &middot; Document à valeur contractuelle &middot; Aucune autre action requise',
  );
}

export function defaultConfirmationRestitution(): string {
  return confirmation(
    'Restitution',
    'Équipements restitués',
    'Signature électronique enregistrée &middot; Document à valeur contractuelle &middot; Aucune autre action requise',
    true,
  );
}

export function defaultConfirmationPvCloture(): string {
  return confirmation(
    'PV de non-restitution',
    'Équipements non restitués',
    'Signature électronique enregistrée &middot; Document à valeur probante &middot; Aucune autre action requise',
  );
}
