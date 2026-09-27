import type { ContestationListItem, ResolveContestationResponse } from '@/contracts/contestations';
import { CONTESTATION_OUTCOME_LABELS, SIGNATURE_TYPE_LABELS } from '@/domain/labels';
import { formatDateLong } from '@/lib/dates';

/** Filtres de la liste : « À traiter » d'abord, c'est le travail du jour. */
export type ContestationFilter = 'pending' | 'founded' | 'not_retained' | 'all';

/** Filtre, son paramètre d'adresse (`filtre=…`, absent pour « À traiter ») et
 *  sa requête : « À traiter » demande `aTraiter=1`, le prédicat de la tuile de
 *  l'accueil, pour afficher exactement autant de lignes que son chiffre. */
export const CONTESTATION_FILTERS: readonly {
  value: ContestationFilter;
  label: string;
  urlValue: string | null;
  query: Readonly<Record<string, string>>;
}[] = [
  { value: 'pending', label: 'À traiter', urlValue: null, query: { aTraiter: '1' } },
  { value: 'founded', label: 'Fondées', urlValue: 'fondees', query: { status: 'resolved' } },
  { value: 'not_retained', label: 'Non retenues', urlValue: 'non-retenues', query: { status: 'rejected' } },
  { value: 'all', label: 'Toutes', urlValue: 'toutes', query: {} },
];

/** Filtre lu dans l'adresse : `filtre=…` connu, sinon « À traiter » (adresse
 *  nue, ou `aTraiter=1` venu de la tuile de l'accueil). */
export function contestationFilterFromSearch(search: string): ContestationFilter {
  const raw = new URLSearchParams(search).get('filtre');
  return CONTESTATION_FILTERS.find((f) => f.urlValue !== null && f.urlValue === raw)?.value ?? 'pending';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jours écoulés depuis la contestation. */
export function contestationAgeDays(createdAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS));
}

export function isPending(c: Pick<ContestationListItem, 'status'>): boolean {
  return c.status === 'open' || c.status === 'in_review';
}

/** Non tranchée depuis plus que le délai de relance. Le seuil vient du
 *  serveur (`overdueSince`, 7 jours ouvrés) : l'écran compte exactement comme
 *  la relance par email et le compteur de l'en-tête. */
export function isOverdue(c: Pick<ContestationListItem, 'status' | 'createdAt'>, overdueSince: string | null): boolean {
  if (!overdueSince || !isPending(c)) return false;
  return new Date(c.createdAt).getTime() < new Date(overdueSince).getTime();
}

/** Ce qu'entraîne « Fondée », selon le document contesté (décision du
 *  26/09) : la remise est remplacée par un bon corrigé ; la restitution ou le
 *  PV se corrige sur le bon d'origine, puis se renvoie à signer. */
export function foundedEffect(c: Pick<ContestationListItem, 'contestedDocument'>): string {
  switch (c.contestedDocument) {
    case 'restitution':
      return 'On corrige : le bon va être corrigé, puis la restitution sera renvoyée à signer au collaborateur. Aucun nouveau bon n’est créé ; le lien de signature actuel est annulé.';
    case 'pv_cloture':
      return 'On corrige : le bon va être corrigé, puis le PV de non-restitution sera renvoyé à signer au collaborateur. Aucun nouveau bon n’est créé ; le lien de signature actuel est annulé.';
    default:
      return 'On corrige : un bon corrigé est créé pour remplacer celui-ci. L’original reste en cours jusqu’à la signature du bon corrigé, puis il est clôturé comme « remplacé ».';
  }
}

/** Ce qu'il reste à faire à l'IT après une décision « Fondée ». */
export function foundedOutcomeMessage(
  reference: string,
  collaborateurName: string,
  result: {
    replacementBon: Pick<NonNullable<ResolveContestationResponse['replacementBon']>, 'reference'> | null;
    reopenedDocument: ResolveContestationResponse['reopenedDocument'];
  },
): string {
  if (result.replacementBon) {
    return `Bon corrigé ${result.replacementBon.reference} créé : vérifiez-le puis envoyez-le à ${collaborateurName}.`;
  }
  const document = result.reopenedDocument === 'pv_cloture' ? 'le PV de non-restitution' : 'la restitution';
  return `Corrigez ${reference}, puis renvoyez ${document} à signer à ${collaborateurName}.`;
}

/** Document contesté, en titre (« Mise à disposition », « Restitution »…) ;
 *  une contestation d'avant la vague 2 portait sur la remise. */
export function contestedDocumentLabel(c: Pick<ContestationListItem, 'contestedDocument'>): string {
  return SIGNATURE_TYPE_LABELS[c.contestedDocument ?? 'mise_disposition'];
}

/** Où en est la contestation, pour l'équipe informatique : qui l'a prise en
 *  charge, qui l'a tranchée, et quand (R-055). */
export function contestationFollowUpForIt(c: ContestationListItem): string {
  if (c.outcome || c.status === 'resolved' || c.status === 'rejected') {
    const outcome = c.outcome ?? (c.status === 'resolved' ? 'founded' : 'not_retained');
    const by = c.resolvedBy ? ` par ${c.resolvedBy.displayName}` : '';
    return `${CONTESTATION_OUTCOME_LABELS[outcome]} — tranchée${by} le ${formatDateLong(c.resolvedAt ?? c.updatedAt)}`;
  }
  if (c.status === 'in_review') {
    const by = c.reviewedBy ? ` par ${c.reviewedBy.displayName}` : '';
    const on = c.reviewedAt ? ` le ${formatDateLong(c.reviewedAt)}` : '';
    return `Prise en charge${by}${on}`;
  }
  return 'Nouvelle — personne ne l’a prise en charge';
}
