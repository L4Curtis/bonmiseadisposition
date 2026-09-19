import { Logger } from '@nestjs/common';
import * as ldap from 'ldapjs';

/**
 * Construit les options de connexion ldapjs à partir de l'URL et du réglage
 * use_ssl. Fonction pure : ne se connecte à rien, ne journalise rien.
 *
 * C'est le schéma de l'URL qui détermine RÉELLEMENT si la connexion est
 * chiffrée : ldapjs ouvre un socket TLS ou en clair selon `ldaps://` vs
 * `ldap://`, quoi que dise `use_ssl` — `use_ssl` ne fait qu'ajouter des
 * tlsOptions explicites. `ldaps://` implique donc toujours TLS ici.
 *
 * Incohérence dangereuse : l'admin croit avoir activé le chiffrement
 * (use_ssl=true) mais l'URL est restée en ldap:// (texte clair) — la
 * connexion ne serait PAS chiffrée malgré ce que la configuration laisse
 * penser. Comportement sûr retenu (décision LOT A6, cf. rapport) : refuser de
 * démarrer plutôt que de laisser croire à une connexion chiffrée qui ne l'est
 * pas. L'inverse (use_ssl=false avec une URL ldaps://) n'est pas une
 * incohérence dangereuse : l'URL suffit à chiffrer, tlsOptions ci-dessous
 * s'applique quand même.
 */
export function buildLdapClientOptions(url: string, useSsl: string | null): ldap.ClientOptions {
  const isLdapsUrl = /^ldaps:\/\//i.test(url);

  if (useSsl === 'true' && !isLdapsUrl) {
    throw new Error(
      "Configuration LDAP incohérente : SSL/TLS est activé mais l'URL LDAP ne commence pas par « ldaps:// ». " +
      'Utilisez une URL de la forme ldaps://<FQDN du contrôleur de domaine>:636.',
    );
  }

  return {
    url,
    // Vérification du certificat TOUJOURS active dès que la connexion est
    // chiffrée (jamais rejectUnauthorized: false) : un bypass conditionnel
    // avait exposé le bind LDAP à une attaque MITM sur staging/recette.
    tlsOptions: isLdapsUrl ? { rejectUnauthorized: true } : undefined,
    timeout: 10000,
    connectTimeout: 10000,
  };
}

/** Crée le client ldapjs et attache un handler d'erreur (les erreurs de
 *  connexion réelles remontent via le callback de bind()). */
export function createLdapClient(url: string, useSsl: string | null, logger: Logger): ldap.Client {
  const client = ldap.createClient(buildLdapClientOptions(url, useSsl));

  // Always attach an error handler to prevent unhandled 'error' event crashes.
  // Real connection errors will surface through the bind() callback.
  client.on('error', (err: Error) => {
    logger.warn(`LDAP client error (handled): ${err.message}`);
  });

  return client;
}

/** Promisifie le bind ldapjs. L'erreur brute (TLS, réseau ou protocolaire
 *  LDAP) est transmise telle quelle, sans l'envelopper dans un nouveau Error :
 *  elle porte les codes (`err.code`, `err.name`) dont
 *  translateLdapConnectionError a besoin pour produire un message actionnable
 *  côté appelant. */
export function bindLdapClient(client: ldap.Client, bindDn: string, bindPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.bind(bindDn, bindPassword, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
