/**
 * Mise en page des fenêtres de la fiche d'un bon sur téléphone (moins de
 * 640 px) : plein écran, défilement dans la fenêtre, boutons d'au moins 44 px
 * de haut, pleine largeur et séparés. La refonte mobile complète de ces
 * écrans viendra avec les parcours de terrain ; ces classes garantissent déjà
 * qu'on s'en sert au doigt.
 */

/** À ajouter au `className` d'un `DialogContent`. */
export const PHONE_FULLSCREEN_DIALOG =
  'max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-dvh max-sm:max-h-dvh ' +
  'max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:overflow-y-auto ' +
  'max-sm:content-start';

/** Bouton d'une fenêtre : 44 px de haut au moins sur téléphone. */
export const TOUCH_BUTTON = 'max-sm:min-h-11 max-sm:text-sm';

/** Pied de fenêtre : boutons empilés et espacés sur téléphone. */
export const TOUCH_FOOTER = 'gap-2 max-sm:flex-col-reverse max-sm:[&>*]:w-full';
