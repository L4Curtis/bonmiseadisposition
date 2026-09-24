/** Mémorisation, dans ce navigateur seulement, des derniers filtres et du tri
 *  de la liste des bons : revenir sur « Bons » depuis le menu retrouve la
 *  liste telle qu'on l'a laissée. Simple confort — le stockage peut être
 *  indisponible (navigation privée, stockage bloqué) : chaque accès est
 *  protégé et un échec revient à « rien de mémorisé ». */
const STORAGE_KEY = 'bons-list:last-query:v1';

export function loadRememberedQuery(): URLSearchParams | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new URLSearchParams(raw) : null;
  } catch {
    return null;
  }
}

export function saveRememberedQuery(params: URLSearchParams): void {
  try {
    const raw = params.toString();
    if (raw) window.localStorage.setItem(STORAGE_KEY, raw);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible : la liste fonctionne simplement sans mémoire.
  }
}
