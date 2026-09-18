/**
 * Classes d'entrée décalée pour une grille de tuiles ou de cartes : chaque
 * élément arrive légèrement après le précédent, au lieu d'un bloc qui surgit
 * d'un coup à la fin du chargement.
 *
 * Écrites en toutes lettres, et non composées (`animate-fade-in-up-${i}`) :
 * Tailwind n'analyse que les chaînes littérales présentes dans le code, une
 * classe construite à l'exécution ne génère aucun CSS.
 *
 * `motion-safe:` — l'animation est désactivée quand le système est réglé sur
 * « réduire les animations » (accessibilité, mal des transports).
 */
const STAGGER_CLASSES = [
  'motion-safe:animate-fade-in-up-1',
  'motion-safe:animate-fade-in-up-2',
  'motion-safe:animate-fade-in-up-3',
  'motion-safe:animate-fade-in-up-4',
  'motion-safe:animate-fade-in-up-5',
  'motion-safe:animate-fade-in-up-6',
] as const;

/** Classe d'apparition du n-ième élément. Au-delà du dernier palier, tous les
 *  éléments partagent le même délai : une cascade trop longue donne
 *  l'impression que la page rame. */
export function staggerClass(index: number): string {
  const borne = Math.min(Math.max(index, 0), STAGGER_CLASSES.length - 1);
  return STAGGER_CLASSES[borne];
}

/** Fondu simple, pour un contenu qui remplace un squelette de chargement ou
 *  pour le passage d'un onglet à l'autre. */
export const FADE_IN = 'motion-safe:animate-fade-in';
