/**
 * Traduction des erreurs de connexion LDAP/LDAPS en messages français
 * actionnables pour l'administrateur (Configuration → Active Directory →
 * tester, et statut de la synchronisation planifiée).
 *
 * Fonction pure : elle ne journalise rien elle-même — le détail technique
 * d'origine (stack, message brut Node/ldapjs) reste dans les journaux
 * serveur, écrit par l'appelant (LdapService). Seul le message traduit,
 * sans détail sensible, est renvoyé à l'utilisateur.
 *
 * Procédure complète (export de la CA interne, dépôt du certificat,
 * NODE_EXTRA_CA_CERTS…) : voir deploy/README.md, section « LDAPS ».
 */

const DOC_HINT = 'Voir deploy/README.md, section « LDAPS ».';

// Codes TLS Node.js indiquant que la chaîne de certification remonte à une
// autorité de certification (CA) que Node ne connaît pas — typiquement la CA
// racine interne d'un domaine Active Directory, absente du magasin de CA
// publiques utilisé par défaut.
const UNTRUSTED_CA_TLS_CODES: ReadonlySet<string> = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
]);

// Code LDAP protocolaire 8 (« strongerAuthRequired » — RFC 4511 ; exposé par
// ldapjs sous le nom StrongAuthRequiredError) : le contrôleur de domaine
// refuse une connexion non signée et exige LDAP signing / channel binding.
const LDAP_STRONG_AUTH_REQUIRED_CODE = 8;

interface ErrorWithCode {
  code?: unknown;
}

interface LdapProtocolError {
  code?: unknown;
  name?: unknown;
}

function getStringCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as ErrorWithCode).code;
  return typeof code === 'string' ? code : undefined;
}

function getMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return undefined;
}

/** Code LDAP numérique 8 (ldapjs) OU nom d'erreur évoquant une auth forcée —
 *  couvre les variations possibles selon la version d'ldapjs/le serveur AD. */
function isStrongAuthRequired(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, name } = err as LdapProtocolError;
  if (code === LDAP_STRONG_AUTH_REQUIRED_CODE) return true;
  return typeof name === 'string' && /strong\w*AuthRequired/i.test(name);
}

/** ECONNREFUSED (port fermé) ou dépassement de délai à la connexion (pare-feu
 *  qui laisse la requête sans réponse plutôt que de la rejeter). */
function isConnectionRefusedOrTimeout(err: unknown): boolean {
  const code = getStringCode(err);
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') return true;
  const message = getMessage(err) ?? '';
  return /connection timeout/i.test(message);
}

export function translateLdapConnectionError(err: unknown): string {
  const tlsCode = getStringCode(err);

  if (tlsCode && UNTRUSTED_CA_TLS_CODES.has(tlsCode)) {
    return (
      "Connexion LDAPS refusée : le certificat du contrôleur de domaine est signé par une autorité de " +
      "certification (CA) interne que ce serveur ne connaît pas. Déposez le certificat de la CA racine " +
      'sur le serveur et définissez la variable NODE_EXTRA_CA_CERTS. ' +
      DOC_HINT
    );
  }

  if (tlsCode === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    return (
      "Connexion LDAPS refusée : le nom utilisé dans l'URL ne correspond à aucun nom présent dans le " +
      "certificat du contrôleur de domaine. Utilisez le nom complet (FQDN) du contrôleur tel qu'il figure " +
      'dans le certificat, pas son adresse IP. ' +
      DOC_HINT
    );
  }

  if (tlsCode === 'CERT_HAS_EXPIRED') {
    return (
      'Connexion LDAPS refusée : le certificat du contrôleur de domaine est expiré. Renouvelez-le côté ' +
      'Active Directory puis réessayez. ' +
      DOC_HINT
    );
  }

  if (isStrongAuthRequired(err)) {
    return (
      'Connexion LDAP refusée : le contrôleur de domaine exige une connexion signée (LDAP signing / ' +
      "channel binding) et refuse cette connexion en clair. Passez l'URL LDAP en " +
      'ldaps://<FQDN du contrôleur de domaine>:636. ' +
      DOC_HINT
    );
  }

  if (isConnectionRefusedOrTimeout(err)) {
    return (
      'Connexion au contrôleur de domaine impossible (port fermé ou pare-feu). Vérifiez que le port 636 ' +
      '(LDAPS) est joignable depuis ce serveur. ' +
      DOC_HINT
    );
  }

  // Erreur non reconnue par cette traduction : on renvoie son message tel
  // quel plutôt qu'un message générique qui masquerait une information utile
  // (ex. identifiants invalides, base de recherche introuvable...).
  return getMessage(err) ?? 'Erreur de connexion LDAP';
}
