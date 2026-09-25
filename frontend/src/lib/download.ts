/** Durée de vie de l'adresse temporaire du fichier : le temps que le
 *  navigateur commence l'enregistrement (certains le font après le clic). */
export const DOWNLOAD_URL_LIFETIME_MS = 30_000;

/**
 * Propose l'enregistrement d'un fichier (reçu du serveur ou construit dans le
 * navigateur) sous `filename`, par un lien temporaire jamais ajouté à la page.
 * L'adresse temporaire est libérée après un délai : certains navigateurs
 * lisent le fichier après le clic. Pour un fichier du serveur, les écrans
 * passent par `useDownload`, qui choisit le nom et prévient s'il a été coupé.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  try {
    link.click();
  } finally {
    setTimeout(() => revoke(url), DOWNLOAD_URL_LIFETIME_MS);
  }
}

/** Libère l'adresse temporaire. Vérifie que la fonction existe : jsdom (tests)
 *  ne la fournit pas, et la minuterie peut survivre au test qui l'a simulée. */
function revoke(url: string): void {
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}
