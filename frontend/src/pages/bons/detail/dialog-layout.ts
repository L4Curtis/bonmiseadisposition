/**
 * Mise en page des fenêtres de la fiche d'un bon sur téléphone (moins de
 * 640 px) : plein écran, défilement dans la fenêtre, boutons d'au moins 44 px
 * de haut, pleine largeur et séparés. La refonte mobile complète de ces
 * écrans viendra avec les parcours de terrain ; ces classes garantissent déjà
 * qu'on s'en sert au doigt.
 */

/** Plein écran sur téléphone en portrait (moins de 640 px de large). */
const PHONE_FULLSCREEN =
  'max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-dvh max-sm:max-h-dvh ' +
  'max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0';

/** Jamais plus haute que l'écran : un téléphone en paysage n'a que 340 px
 *  environ de haut (iPhone), la fenêtre défile alors en elle-même. */
const FITS_SCREEN = 'max-h-[calc(100dvh-1rem)]';

/** À ajouter au `className` d'un `DialogContent` simple (texte, champ,
 *  boutons) : la fenêtre entière défile si l'écran est trop bas. */
export const PHONE_FULLSCREEN_DIALOG = `${PHONE_FULLSCREEN} ${FITS_SCREEN} overflow-y-auto max-sm:content-start`;

/**
 * Fenêtre à bandeau de titre et à boutons (signature IT, restitution,
 * non-restitution, équipement retrouvé) : en-tête et boutons restent
 * visibles, seul le corps défile — en portrait comme en paysage. Structure :
 * `DialogContent` (DIALOG_FRAME) > bandeau (DIALOG_HEADER_BAND) > corps
 * (DIALOG_BODY) > pied (DIALOG_FOOTER_BAR).
 */
export const DIALOG_FRAME = `flex flex-col gap-0 overflow-hidden p-0 ${PHONE_FULLSCREEN} ${FITS_SCREEN}`;

/** Bandeau de titre : jamais écrasé, plus serré sur un écran bas. */
export const DIALOG_HEADER_BAND = 'shrink-0 px-5 py-4 pr-12 [@media(max-height:500px)]:py-2';

/** Corps défilant de la fenêtre. */
export const DIALOG_BODY = 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [@media(max-height:500px)]:py-3';

/** Pied de fenêtre : toujours visible, sous le corps. */
export const DIALOG_FOOTER_BAR = 'shrink-0 border-t border-border/60 bg-card px-5 py-3';

/** Cadre de signature : la même hauteur dans toutes les fenêtres, réduite
 *  seulement quand l'écran est bas (téléphone en paysage). */
export const SIGNATURE_CANVAS_HEIGHT = 'h-[200px] sm:h-[150px] [@media(max-height:500px)]:h-[110px]';

/** Bouton d'une fenêtre : 44 px de haut au moins sur téléphone, en portrait
 *  comme en paysage (écran tactile, quelle que soit sa largeur). */
export const TOUCH_BUTTON = 'max-sm:min-h-11 max-sm:text-sm [@media(pointer:coarse)]:min-h-11';

/** Pied de fenêtre : boutons empilés et espacés sur téléphone. */
export const TOUCH_FOOTER = 'gap-2 max-sm:flex-col-reverse max-sm:[&>*]:w-full';
