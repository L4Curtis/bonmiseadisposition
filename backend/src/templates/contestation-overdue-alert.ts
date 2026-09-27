import { refBadge } from './email-layout';
import { renderTemplateHtml } from './render';
import { defaultContestationOverdueAlert } from './defaults/notice-defaults';
import { escapeHtml } from '../notification/messages/escape-html';
import { formatParisDate } from '../common/dates/paris';
import { bonUrl, contestationsUrl } from '../notification/app-links';

/**
 * Relance de l'équipe informatique : les contestations qui attendent une
 * décision depuis plus de N jours ouvrés (lot 2C, `contestation/overdue/`). Même mise
 * en page que les autres emails, un lien direct vers chaque bon et un lien
 * vers la liste à traiter.
 *
 * Modèle personnalisable `contestation_overdue_alert` : `renderContestationOverdueAlert`
 * rend la version de l'administration ; `buildContestationOverdueAlert`, le
 * modèle par défaut. Le résultat `{ subject, html }` s'envoie tel quel.
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

/** Variables + sujet + modèle (`contestation_overdue_alert`) de la relance. */
export interface OverdueAlertMessage {
  templateId: 'contestation_overdue_alert';
  vars: Record<string, string>;
  subject: string;
}

/** Ce qui sait rendre un modèle personnalisable (TemplatesService). */
export interface TemplateRenderer {
  renderTemplate(id: string, vars: Record<string, string>): Promise<string>;
}

export function buildContestationOverdueAlertMessage(
  items: readonly OverdueContestationItem[],
  options: ContestationOverdueAlertOptions,
): OverdueAlertMessage {
  const now = options.now ?? new Date();
  const count = items.length;
  const subject =
    count === 1
      ? `[CONTESTATION] ${items[0].bonReference} attend une décision depuis plus de ${options.afterDays} jours ouvrés`
      : `[CONTESTATIONS] ${count} contestations attendent une décision depuis plus de ${options.afterDays} jours ouvrés`;
  return {
    templateId: 'contestation_overdue_alert',
    vars: {
      COUNT: String(count),
      AFTER_DAYS: String(options.afterDays),
      OVERDUE_LEAD: count === 1 ? 'Une contestation attend' : `${count} contestations attendent`,
      OVERDUE_LIST: items.map((entry) => item(entry, options.appUrl, now)).join('\n'),
      CONTESTATIONS_URL: contestationsUrl(options.appUrl),
    },
    subject,
  };
}

/** Email de la relance avec le modèle par défaut (sans personnalisation). */
export function buildContestationOverdueAlert(
  items: readonly OverdueContestationItem[],
  options: ContestationOverdueAlertOptions,
): { subject: string; html: string } {
  const { vars, subject } = buildContestationOverdueAlertMessage(items, options);
  return { subject, html: renderTemplateHtml(defaultContestationOverdueAlert(), vars) };
}

/** Email de la relance rendu avec le modèle personnalisable (version de
 *  l'administration si elle existe, sinon le modèle par défaut). */
export async function renderContestationOverdueAlert(
  templates: TemplateRenderer,
  items: readonly OverdueContestationItem[],
  options: ContestationOverdueAlertOptions,
): Promise<{ subject: string; html: string }> {
  const { templateId, vars, subject } = buildContestationOverdueAlertMessage(items, options);
  return { subject, html: await templates.renderTemplate(templateId, vars) };
}
