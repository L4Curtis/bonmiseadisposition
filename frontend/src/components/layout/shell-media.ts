/**
 * Quand la coque passe-t-elle en « téléphone » (tiroir, loupe, cibles de
 * 44 px) plutôt qu'en « tablette et ordinateur » (menu latéral) ?
 *
 * La largeur seule ne suffit pas : un téléphone couché fait plus de 768 px de
 * large (Pixel 7 : 863 px utiles) et recevait le menu latéral de bureau, avec
 * des cibles de 32 px. On regarde donc aussi la hauteur et le pointeur : un
 * écran tactile de 500 px de haut au plus est un téléphone couché. Une
 * tablette (plus de 700 px de haut dans les deux sens) et un ordinateur
 * (pointeur fin, quelle que soit la taille de la fenêtre) ne changent pas.
 *
 * Les deux requêtes sont exactement complémentaires ; la même sert au CSS
 * (variante Tailwind `shell:` dans `tailwind.config.ts`, bloc « téléphone »
 * d'`index.css`) et au JavaScript (`useMediaQuery`).
 */

/** Hauteur au-delà de laquelle un écran tactile n'est plus un téléphone couché. */
const PHONE_LANDSCAPE_MAX_HEIGHT = 500;

/** Coque « téléphone » : étroite, ou tactile et basse (téléphone en paysage). */
export const PHONE_SHELL_QUERY = `(max-width: 767px), (pointer: coarse) and (max-height: ${PHONE_LANDSCAPE_MAX_HEIGHT}px)`;

/** Coque « tablette et ordinateur » : le complément exact de la précédente. */
export const DESKTOP_SHELL_QUERY = [
  '(min-width: 768px) and (pointer: fine)',
  '(min-width: 768px) and (pointer: none)',
  `(min-width: 768px) and (min-height: ${PHONE_LANDSCAPE_MAX_HEIGHT + 1}px)`,
].join(', ');
