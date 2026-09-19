/**
 * Validation structurelle des filtres LDAP saisis par l'administrateur
 * (Configuration → Active Directory). Fonction pure : ne journalise rien,
 * lève une erreur explicite au premier problème rencontré.
 */
export function validateLdapFilterInput(filter: string): void {
  if (!filter || typeof filter !== 'string') {
    throw new Error('Filtre LDAP manquant');
  }
  if (filter.length > 512) {
    throw new Error('Filtre LDAP trop long (max 512 caractères)');
  }
  if (filter.includes('\0')) {
    throw new Error('Filtre LDAP invalide : caractère nul détecté');
  }
  // Character allow-list (documented in the SEC-02 audit fix): word chars,
  // filter operators, wildcards and the chars needed for OID matching rules
  if (!/^[\w()&|!=*\-\s.@:,]*$/.test(filter)) {
    throw new Error('Filtre LDAP invalide : caractères non autorisés détectés');
  }
  if (!filter.startsWith('(') || !filter.endsWith(')')) {
    throw new Error('Filtre LDAP invalide : doit commencer par "(" et se terminer par ")"');
  }
  // Check balanced parentheses
  let depth = 0;
  for (const ch of filter) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth < 0) throw new Error('Filtre LDAP invalide : parenthèses non équilibrées');
  }
  if (depth !== 0) throw new Error('Filtre LDAP invalide : parenthèses non équilibrées');
}
