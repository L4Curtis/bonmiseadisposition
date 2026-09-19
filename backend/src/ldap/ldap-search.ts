import { Logger } from '@nestjs/common';
import * as ldap from 'ldapjs';
import { LdapUser, parseLdapSearchEntry } from './ldap-entry-parser';

/**
 * Recherche paginée (côté serveur) des utilisateurs LDAP correspondant au
 * filtre. AD limite les résultats non paginés à 1000 entrées
 * (sizeLimitExceeded faisait échouer toute la sync sur les grands
 * annuaires) — ldapjs pilote automatiquement les pages successives ; on
 * compte juste les pages ici pour le log (LOT C bug #8).
 */
export function searchLdapUsers(client: ldap.Client, base: string, filter: string, logger: Logger): Promise<LdapUser[]> {
  return new Promise((resolve, reject) => {
    const users: LdapUser[] = [];
    const options: ldap.SearchOptions = {
      filter,
      scope: 'sub',
      attributes: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName', 'department', 'company', 'title'],
      paged: { pageSize: 500 },
    };

    let pageCount = 0;

    client.search(base, options, (err, res) => {
      if (err) return reject(err);

      res.on('page', () => {
        pageCount++;
      });

      let totalEntries = 0;
      let skippedNoObj = 0;
      let skippedNoSam = 0;
      let skippedNoMail = 0;

      res.on('searchEntry', (entry) => {
        totalEntries++;

        const result = parseLdapSearchEntry(entry, logger);
        if (result.user) {
          users.push(result.user);
          return;
        }
        if (result.skipped === 'noObj') skippedNoObj++;
        else if (result.skipped === 'noSam') skippedNoSam++;
        else if (result.skipped === 'noMail') skippedNoMail++;
      });

      res.on('error', reject);
      res.on('end', () => {
        logger.log(
          `LDAP search done — total: ${totalEntries}, importés: ${users.length}, ` +
          `sans objet: ${skippedNoObj}, sans sAMAccountName: ${skippedNoSam}, sans mail: ${skippedNoMail}, ` +
          `pages: ${Math.max(pageCount, 1)}`
        );
        resolve(users);
      });
    });
  });
}
