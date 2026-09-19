/**
 * Un `returnTo` sûr : un chemin absolu qui reste sur l'origine courante.
 * Comparaison d'origine plutôt qu'un simple test de préfixe "/" : une regex
 * du type /^\/[^/]/ laisse passer des payloads comme "/\evil.com",
 * "/%09/evil.com" ou "/%0a/evil.com" que le navigateur normalise en URL
 * absolue vers un autre host au moment de l'assignation à
 * window.location.href (open redirect). `new URL` applique la même
 * normalisation AVANT la comparaison d'origine, donc ces vecteurs sont
 * rejetés.
 *
 * Module partagé par la connexion (Login), le changement de mot de passe
 * forcé (ChangePassword) et la signature (SignaturePage/useSignatureToken, en
 * défense en profondeur sur le token d'URL) — anciennement dupliqué à
 * l'identique dans ces deux premiers.
 */
export function isSafeReturnTo(v: string): boolean {
  try {
    const u = new URL(v, window.location.origin);
    return u.origin === window.location.origin && v.startsWith('/');
  } catch {
    return false;
  }
}
