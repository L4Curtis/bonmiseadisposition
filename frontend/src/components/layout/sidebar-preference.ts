/**
 * Préférence « menu latéral replié », mémorisée par navigateur.
 * Elle ne concerne que la tablette et l'ordinateur : sur téléphone, le menu
 * est un tiroir, toujours avec libellés, et cette préférence est ignorée.
 */
const STORAGE_KEY = 'sidebar-collapsed';

/** Tablette en portrait (et petites fenêtres) : moins de 1024 px de large. */
const NARROW_QUERY = '(max-width: 1023px)';

function isNarrowScreen(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
}

/**
 * Choix mémorisé s'il existe ; sinon, menu réduit sur tablette en portrait
 * (il y prenait 30 % de la largeur) et déplié sur ordinateur.
 */
export function readSidebarCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch {
    // Stockage indisponible (navigation privée stricte) : valeur par défaut.
  }
  return isNarrowScreen();
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Stockage indisponible : la préférence vaut pour la session seulement.
  }
}
