/**
 * Initiales d'une personne, identiques partout dans la coque (en-tête, menu
 * latéral, tiroir) : première lettre du premier et du dernier mot du nom
 * (« Hugo Petit » → « HP »), ou les deux premières lettres d'un nom en un mot.
 */
export function userInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('fr-FR');
  const first = words[0].charAt(0);
  const last = words[words.length - 1].charAt(0);
  return `${first}${last}`.toLocaleUpperCase('fr-FR');
}
