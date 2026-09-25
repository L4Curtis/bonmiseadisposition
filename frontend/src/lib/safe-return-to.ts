/**
 * Adresse de retour après connexion (`?returnTo=`), protégée contre les
 * redirections ouvertes.
 *
 * Un `returnTo` n'est accepté que s'il désigne un chemin interne :
 * - il commence par « / » mais pas par « // » (adresse vers un autre site) ;
 * - il ne contient ni barre oblique inversée ni caractère de contrôle, que le
 *   navigateur normalise en « // » (« /\evil.com », « /%09/evil.com ») ;
 * - une fois résolu par `new URL`, il reste sur l'origine courante ;
 * - il ne dépasse pas {@link MAX_RETURN_TO_LENGTH} caractères.
 * Mêmes règles que le serveur (`isSafeReturnTo` de `auth.controller.ts`), qui
 * revalide l'adresse conservée pendant la connexion Microsoft.
 *
 * Utilisé par la connexion (Login), le changement de mot de passe forcé, la
 * page de signature, la garde des routes (ProtectedRoute) et le client API
 * quand la session expire.
 */
/** Au-delà, ce n'est pas une adresse d'écran (même plafond que le serveur). */
export const MAX_RETURN_TO_LENGTH = 2048;

export function isSafeReturnTo(v: string): boolean {
  if (v.length > MAX_RETURN_TO_LENGTH) return false;
  if (!v.startsWith('/') || v.startsWith('//')) return false;
  if (hasBackslashOrControlCharacter(v)) return false;
  try {
    return new URL(v, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** La valeur si elle est sûre, sinon `null` (paramètre absent ou refusé). */
export function safeReturnTo(raw: string | null | undefined): string | null {
  return raw && isSafeReturnTo(raw) ? raw : null;
}

/**
 * Adresse de la page de connexion qui ramènera ensuite à `returnTo`.
 * L'accueil et la page de connexion elle-même ne sont pas mémorisés : sans
 * intérêt pour le premier, boucle pour la seconde.
 */
export function loginPathFor(returnTo: string): string {
  const safe = safeReturnTo(returnTo);
  if (!safe || safe === '/' || safe === '/login' || safe.startsWith('/login?')) return '/login';
  return `/login?returnTo=${encodeURIComponent(safe)}`;
}

function hasBackslashOrControlCharacter(v: string): boolean {
  return Array.from(v).some((char) => {
    const code = char.charCodeAt(0);
    return char === '\\' || code < 0x20 || code === 0x7f;
  });
}
