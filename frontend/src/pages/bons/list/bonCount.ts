/** Nombre de bons en toutes lettres, accordé à la française : le singulier
 *  vaut pour 0 et 1 (« 0 bon », « 1 bon », « 2 bons »). */
export function bonCountLabel(total: number): string {
  return `${total.toLocaleString('fr-FR')} bon${total > 1 ? 's' : ''}`;
}
