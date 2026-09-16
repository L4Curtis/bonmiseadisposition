/**
 * Normalise un email pour toute écriture ou comparaison d'identité (LOT C bug #6) :
 * espaces superflus retirés, casse uniformisée en minuscules. Utilisé par
 * l'auth locale, le callback SSO (Entra ID) et la synchronisation LDAP pour
 * qu'une même adresse ne crée jamais deux identités distinctes (doublons,
 * violations P2002) simplement parce qu'une source l'a envoyée avec une casse
 * différente.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
