// Comparaison d'origine plutôt qu'un simple test de préfixe "/" : une regex
// du type /^\/[^/]/ laisse passer des payloads comme "/\evil.com",
// "/%09/evil.com" ou "/%0a/evil.com" que le navigateur normalise en URL
// absolue vers un autre host au moment de l'assignation à
// window.location.href (open redirect). Dupliquée dans Login.tsx : pas de
// lib/** partagée dans le périmètre de ce lot. Utilisée ici en défense en
// profondeur sur '/signer/' + token (token = segment d'URL non validé).
export function isSafeReturnTo(v: string): boolean {
  try {
    const u = new URL(v, window.location.origin);
    return u.origin === window.location.origin && v.startsWith('/');
  } catch {
    return false;
  }
}
