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
} from '../../templates/email-layout';
import { escapeHtml } from './escape-html';

export interface SystemNoticeEmail {
  html: string;
  subject: string;
}

function filialeNomOf(bon: NotificationBon): string {
  return bon.filiale?.displayName ?? bon.filiale?.name ?? '';
}

function civiliteLabel(bon: NotificationBon): string {
  return bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
}

/** Email "bon annulé" — HTML complet construit directement via email-layout
 *  (ces notices système n'utilisent pas TemplatesService/renderTemplate). */
export function buildCancellationNotice(bon: NotificationBon): SystemNoticeEmail {
  const filialeNom = filialeNomOf(bon);
  const collabName = bon.collaborateur?.displayName ?? '';
  const civilite = civiliteLabel(bon);

  const html = emailWrapper(card(
    brandHeader('Bon annulé', escapeHtml(filialeNom), { text: 'Annulation', bg: 'rgba(255,255,255,0.18)' }),
    metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
    emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#4A463F;line-height:1.75">
        Nous vous informons que le bon de mise à disposition ${refBadge(escapeHtml(bon.reference))}
        (${escapeHtml(filialeNom)}) a été <strong style="color:#991b1b">annulé</strong>.
        Aucune action n'est attendue de votre part.
      </p>
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous avez des questions, veuillez contacter votre service informatique.
      </p>
      `),
    footer(),
  ));

  return { html, subject: `Bon ${bon.reference} — annulé` };
}

/** Email "équipement(s) retrouvé(s)" pour les équipements listés dans
 *  equipmentIds (parmi ceux du bon), précédemment signalés non restitués. */
export function buildMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): SystemNoticeEmail {
  const filialeNom = filialeNomOf(bon);
  const collabName = bon.collaborateur?.displayName ?? '';
  const civilite = civiliteLabel(bon);

  const foundEquipments = (bon.equipments ?? []).filter((eq) => equipmentIds.includes(eq.id));

  const equipLines = foundEquipments
    .map((eq) => {
      const label = eq.catalogItem
        ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
        : escapeHtml(eq.customLabel || 'Équipement');
      const serial = eq.serialNumber ? ` (N° série : ${escapeHtml(eq.serialNumber)})` : '';
      return `<li style="padding:6px 0;font-size:14px;color:#4A463F;list-style:none">${label}${serial}</li>`;
    })
    .join('\n');

  const equipItems = equipLines
    ? equipLines
    : '<li style="padding:6px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';

  const html = emailWrapper(card(
    brandHeader('Équipement(s) retrouvé(s)', escapeHtml(filialeNom), { text: 'Mise à jour', bg: 'rgba(255,255,255,0.18)' }),
    metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
    emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75">
        Nous vous informons que le ou les équipements suivants, précédemment signalés comme non restitués
        sur le bon ${refBadge(escapeHtml(bon.reference))} (${escapeHtml(filialeNom)}),
        ont été <strong style="color:#166534">retrouvés</strong> :
      </p>
      ${sectionLabel('Équipements retrouvés')}
      ${equipList(equipItems, '#f0fdf4', '#bbf7d0')}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous avez des questions, veuillez contacter votre service informatique.
      </p>
      `),
    footer(),
  ));

  return { html, subject: `Bon ${bon.reference} — équipement(s) retrouvé(s)` };
}

/** Email "bon clôturé sans signature" (constat unilatéral IT). */
export function buildUnilateralCloseNotice(
  bon: NotificationBon,
  reason: string,
  newStatus: string,
): SystemNoticeEmail {
  const filialeNom = filialeNomOf(bon);
  const collabName = bon.collaborateur?.displayName ?? '';
  const civilite = civiliteLabel(bon);
  const outcome =
    newStatus === 'active'
      ? 'la remise du matériel a été constatée et le bon est désormais actif'
      : 'le bon a été clôturé et archivé';

  const html = emailWrapper(card(
    brandHeader('Bon clôturé sans signature', escapeHtml(filialeNom), { text: 'Constat unilatéral', bg: 'rgba(255,255,255,0.18)' }),
    metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
    emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        En l'absence de signature de votre part, ${outcome} par le service informatique
        pour le bon ${refBadge(escapeHtml(bon.reference))} (${escapeHtml(filialeNom)}).
      </p>
      ${sectionLabel('Motif indiqué')}
      ${quoteBox('#d97706', '#fffbeb', '#fde68a', escapeHtml(reason))}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous contestez ce constat, veuillez contacter votre service informatique au plus vite.
      </p>
      `),
    footer(),
  ));

  return { html, subject: `Bon ${bon.reference} — clôturé sans signature` };
}
