/**
 * Mots de l'avertissement affiché avant un export (« 1 234 équipements,
 * filtres : Filiale : Paris ; Situation : En cours ») et du bandeau affiché
 * après un fichier coupé. Fonctions pures, testées sans écran.
 */

/** Un filtre actif, déjà en mots d'écran (jamais une clé technique). */
export interface ExportFilter {
  readonly label: string;
  readonly value: string;
}

/** Nom des lignes exportées, accordé au nombre. */
export interface ExportItemLabel {
  readonly singular: string;
  readonly plural: string;
}

export const DEFAULT_ITEM_LABEL: ExportItemLabel = { singular: 'ligne', plural: 'lignes' };

const NUMBER = new Intl.NumberFormat('fr-FR');

/** « 1 234 équipements », « 1 équipement », « 0 équipement ». */
export function countLabel(count: number, item: ExportItemLabel = DEFAULT_ITEM_LABEL): string {
  return `${NUMBER.format(count)} ${count > 1 ? item.plural : item.singular}`;
}

/** « Filiale : Paris ; Situation : En cours », ou « aucun » sans filtre. */
export function filtersLabel(filters: readonly ExportFilter[]): string {
  const active = filters.filter((f) => f.value.trim() !== '');
  return active.length === 0 ? 'aucun' : active.map((f) => `${f.label} : ${f.value}`).join(' ; ');
}

/** Vrai si l'export dépassera le plafond du serveur (nombre et plafond connus). */
export function exceedsLimit(count: number | null, limit: number | undefined): boolean {
  return count !== null && limit !== undefined && count > limit;
}

/** Avertissement avant un export trop gros. */
export function limitWarning(count: number, limit: number, item: ExportItemLabel = DEFAULT_ITEM_LABEL): string {
  return `${countLabel(count, item)} correspondent aux filtres, mais un export est limité à ${NUMBER.format(limit)} lignes : `
    + `le fichier ne contiendra que les ${NUMBER.format(limit)} premières. Affinez les filtres pour tout obtenir.`;
}

/** Libellé du bouton de confirmation. */
export function confirmLabel(count: number | null, limit: number | undefined): string {
  if (count !== null && limit !== undefined && count > limit) return `Exporter les ${NUMBER.format(limit)} premières lignes`;
  return 'Exporter';
}

/** Texte du bandeau affiché après un fichier coupé à son plafond. */
export function truncatedMessage(count: number | null, limit: number | undefined): string {
  const content = limit === undefined
    ? 'Le fichier a atteint le nombre maximal de lignes et a été coupé.'
    : `Le fichier ne contient que les ${NUMBER.format(limit)} premières lignes`
      + `${count !== null && count > limit ? ` sur ${NUMBER.format(count)}` : ''}.`;
  return `${content} Affinez les filtres et exportez à nouveau pour obtenir le reste.`;
}
