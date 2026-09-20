/** Identifiant court, unique par appel — utilisé pour que chaque test crée
 *  ses propres collaborateurs/numéros de série et ne collisionne jamais avec
 *  une exécution précédente (la base E2E n'est pas réinitialisée entre deux
 *  lancements consécutifs de `playwright test` sur la même compose). */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Date du jour au format YYYY-MM-DD attendu par les champs `<input type="date">`. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
