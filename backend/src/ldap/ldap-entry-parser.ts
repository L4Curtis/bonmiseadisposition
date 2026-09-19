import { Logger } from '@nestjs/common';

export interface LdapUser {
  sAMAccountName: string;
  displayName: string;
  mail: string;
  department?: string;
  company?: string;
  title?: string;
}

interface LdapEntryAttribute {
  type?: string;
  attribute?: string;
  vals?: string[];
  values?: string[];
  _vals?: string[];
}

interface LdapSearchEntryExt {
  attributes?: LdapEntryAttribute[];
}

// Exclure les emails non-routables (domaines internes AD : .local, .lan, .internal, etc.)
const NON_ROUTABLE_TLDS = ['.local', '.lan', '.internal', '.corp', '.localdomain', '.intranet', '.ad', '.home', '.domain'];

export type LdapEntrySkipReason = 'noObj' | 'noSam' | 'noMail' | 'other';

export type LdapEntryParseResult =
  | { user: LdapUser; skipped?: undefined }
  | { user?: undefined; skipped: LdapEntrySkipReason };

/**
 * Transforme une entrée LDAP brute (ldapjs) en LdapUser, ou signale pourquoi
 * elle est ignorée (fonction pure — ne journalise que via le `logger` fourni
 * explicitement en paramètre, aucune dépendance implicite).
 *
 * Lecture via entry.attributes (tableau ldapjs, fiable quelle que soit la
 * version) : entry.object peut avoir des problèmes de casse ou de structure
 * selon la version.
 */
export function parseLdapSearchEntry(entry: unknown, logger: Logger): LdapEntryParseResult {
  const attrs: LdapEntryAttribute[] = (entry as LdapSearchEntryExt).attributes || [];
  const attrMap: Record<string, string> = {};
  for (const attr of attrs) {
    const type: string = (attr.type || attr.attribute || '').toLowerCase();
    const vals: string[] = attr.vals || attr.values || attr._vals || [];
    if (type && vals.length > 0) {
      attrMap[type] = String(vals[0]);
    }
  }

  if (Object.keys(attrMap).length === 0) return { skipped: 'noObj' };

  const sam = attrMap['samaccountname'];
  // mail prioritaire, sinon userPrincipalName (toujours rempli en AD)
  const mail = attrMap['mail'] || attrMap['userprincipalname'];

  if (!sam) return { skipped: 'noSam' };
  if (!mail) {
    logger.debug(`Skipped (no mail/UPN): ${sam}`);
    return { skipped: 'noMail' };
  }

  const displayName = attrMap['displayname'] || '';
  // Exclure comptes machine (sam$) et comptes sans displayName (comptes système)
  if (sam.endsWith('$') || displayName === '') {
    logger.debug(`Skipped (compte système): ${sam}`);
    return { skipped: 'other' };
  }

  const emailDomain = mail.split('@')[1]?.toLowerCase() ?? '';
  if (NON_ROUTABLE_TLDS.some((tld) => emailDomain.endsWith(tld))) {
    logger.debug(`Skipped (email non-routable ${mail}): ${sam}`);
    return { skipped: 'other' };
  }

  return {
    user: {
      sAMAccountName: sam,
      displayName,
      mail,
      department: attrMap['department'],
      company: attrMap['company'],
      title: attrMap['title'],
    },
  };
}
