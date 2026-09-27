import { NotificationBon } from '../../common/types';
import { CIVILITE_LONG_LABELS } from '../../bons/bon-status';
import { PARIS_TIME_ZONE } from '../../common/dates/paris';

/**
 * Morceaux communs aux emails : nom de la filiale, formule d'appel, dates à
 * l'heure de Paris (un email envoyé à 0 h 30 porte la date du jour à Paris,
 * pas celle de la veille en UTC — R-040).
 */

export function filialeNomOf(bon: Pick<NotificationBon, 'filiale'>): string {
  return bon.filiale?.displayName ?? bon.filiale?.name ?? '';
}

/** « Madame » / « Monsieur » ; vide si la civilité n'est pas connue. */
export function civiliteLongOf(bon: Pick<NotificationBon, 'civilite'>): string {
  return CIVILITE_LONG_LABELS[bon.civilite as keyof typeof CIVILITE_LONG_LABELS] ?? '';
}

/** « 25 septembre 2026 », à l'heure de Paris ; vide pour une date absente. */
export function formatParisLongDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS_TIME_ZONE });
}

/** Document que le collaborateur signe par un lien, dans le vocabulaire du
 *  lexique (sujets, rappels, confirmations). */
export const DOCUMENT_LABELS: Readonly<Record<'mise_disposition' | 'restitution' | 'pv_cloture', string>> = Object.freeze({
  mise_disposition: 'bon de mise à disposition',
  restitution: 'bon de restitution',
  pv_cloture: 'PV de non-restitution',
});
