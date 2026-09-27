/**
 * Liens directs vers l'application, insérés dans les emails. Un email d'alerte
 * doit mener en un clic à ce qu'il faut traiter (décision du 24/09) ; un email
 * au collaborateur mène à son portail. Les adresses sont celles des écrans
 * actuels : quand elles changeront (vague 4), les anciennes seront
 * redirigées, et seul ce fichier sera à mettre à jour.
 */

/** Fiche d'un bon (équipe informatique ; le collaborateur est redirigé vers
 *  sa propre fiche par les droits de l'écran). */
export function bonUrl(appUrl: string, bonId: string): string {
  return `${appUrl}/bons/${encodeURIComponent(bonId)}`;
}

/** Liste des contestations à traiter. */
export function contestationsUrl(appUrl: string): string {
  return `${appUrl}/admin/contestations`;
}

/** Portail du collaborateur : ses bons et ses équipements. */
export function portalUrl(appUrl: string): string {
  return `${appUrl}/mes-bons`;
}

/** Fiche d'un bon dans le portail du collaborateur. */
export function portalBonUrl(appUrl: string, bonId: string): string {
  return `${portalUrl(appUrl)}/${encodeURIComponent(bonId)}`;
}
