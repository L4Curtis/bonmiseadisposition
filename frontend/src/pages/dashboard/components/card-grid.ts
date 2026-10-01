/**
 * Grille d'une rangée de cinq cartes : cinq colonnes seulement quand chaque
 * carte est assez large pour ses titres (« Équipements chez les
 * collaborateurs »), sinon trois. À 1280 px avec le menu ouvert, cinq
 * colonnes laissaient moins de 80 px au titre et coupaient les mots au milieu
 * (« collaborateu / rs »).
 */
export const FIVE_CARD_GRID = 'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 min-[1400px]:grid-cols-5';
