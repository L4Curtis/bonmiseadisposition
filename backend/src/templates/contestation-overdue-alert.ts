import { emailWrapper, card, brandHeader, metaStrip, body, footer, ctaButton, refBadge } from './email-layout';
import { escapeHtml } from '../notification/messages/escape-html';
import { formatParisDate } from '../common/dates/paris';
import { bonUrl, contestationsUrl } from '../notification/app-links';

/**
 * Relance de l'équipe informatique : les contestations qui attendent une
 * décision depuis plus de N jours ouvrés (lot 2C, `contestation/overdue/`). Même mise
 * en page que les autres emails, un lien direct vers chaque bon et un lien
 * vers la liste à traiter.
 *
 * Usage (run-overdue-alerts.ts) : remplacer `buildOverdueAlertMessage(due,
 * appUrl, now)` par `buildContestationOverdueAlert(due, { appUrl, afterDays:
 * CONTESTATION_OVERDUE_AFTER_DAYS, now })` ; le résultat `{ subject, html }`
 * s'envoie tel quel.
 */

/** Une contestation en retard (forme de `OverdueContestation`, lot 2C). */
export interface OverdueContestationItem {
  bonId: string;
  bonReference: string;
  collaborateurName: string;
  message: string;
  createdAt: Date;
  /** Qui l'a prise en charge ; `null` si personne. */
  reviewerName: string | null;
}

export interface ContestationOverdueAlertOptions {
  appUrl: string;
  /** Délai de la relance, en jours ouvrés (7). */
  afterDays: number;
  now?: Date;
}

const EXCERPT_LENGTH = 160;
const DAY_MS = 24 * 60 * 60 * 1000;

function excerpt(text: string): string {
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text;
}

function item(entry: OverdueContestationItem, appUrl: string, now: Date): string {
  const days = Math.floor((now.getTime() - entry.createdAt.getTime()) / DAY_MS);
  const follow = entry.reviewerName
    ? `Prise en charge par ${escapeHtml(entry.reviewerName)}`
    : '<strong style="color:#991b1b">Personne ne l’a prise en charge</strong>';
  return `<li style="padding:12px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.6;list-style:none">
        <a href="${escapeHtml(bonUrl(appUrl, entry.bonId))}" style="text-decoration:none">${refBadge(escapeHtml(entry.bonReference))}</a>
        <strong style="color:#1B1A18">${escapeHtml(entry.collaborateurName)}</strong> &middot; contestée le ${formatParisDate(entry.createdAt)} (${days} j)<br>
        <span style="font-size:13px">${follow}</span><br>
        <em style="color:#6B665E;font-size:13px">&ldquo;${escapeHtml(excerpt(entry.message))}&rdquo;</em>
      </li>`;
}

export function buildContestationOverdueAlert(
  items: readonly OverdueContestationItem[],
  options: ContestationOverdueAlertOptions,
): { subject: string; html: string } {
  const now = options.now ?? new Date();
  const count = items.length;
  const subject =
    count === 1
      ? `[CONTESTATION] ${items[0].bonReference} attend une décision depuis plus de ${options.afterDays} jours ouvrés`
      : `[CONTESTATIONS] ${count} contestations attendent une décision depuis plus de ${options.afterDays} jours ouvrés`;
  const lead = count === 1 ? 'Une contestation attend' : `${count} contestations attendent`;
  const html = emailWrapper(card(
    brandHeader('Contestations à trancher', 'Relance automatique', { text: 'Action requise', bg: 'rgba(255,255,255,0.18)' }),
    metaStrip([`<strong style="color:#1B1A18">${count}</strong> en attente depuis plus de ${options.afterDays} jours ouvrés`]),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        ${lead} une décision depuis plus de ${options.afterDays} jours ouvrés. Tant qu’elle n’est pas tranchée (« Fondée » ou « Non retenue »), le bon reste bloqué et le collaborateur attend une réponse.
      </p>
      <ul style="margin:0 0 8px;padding:0;list-style:none">${items.map((entry) => item(entry, options.appUrl, now)).join('\n')}</ul>
      ${ctaButton(contestationsUrl(options.appUrl), 'Ouvrir les contestations à traiter')}
      `),
    footer(),
  ));
  return { subject, html };
}
