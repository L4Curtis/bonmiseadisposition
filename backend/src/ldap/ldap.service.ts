import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as ldap from 'ldapjs';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

interface LdapUser {
  sAMAccountName: string;
  displayName: string;
  mail: string;
  department?: string;
  company?: string;
  title?: string;
}

export interface SyncStatus {
  lastSync: Date | null;
  lastSyncSuccess: boolean | null;
  lastSyncCount: number | null;
  lastSyncError: string | null;
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);
  private syncStatus: SyncStatus = {
    lastSync: null,
    lastSyncSuccess: null,
    lastSyncCount: null,
    lastSyncError: null,
  };

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async testConnection(): Promise<{ success: boolean; message: string }> {
    let client: ldap.Client | null = null;
    try {
      client = await this.createClient();
      await this.bindClient(client);
      return { success: true, message: 'Connexion LDAP réussie' };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Erreur de connexion LDAP' };
    } finally {
      // Also on bind failure — otherwise each failed test leaks a TCP connection
      client?.destroy();
    }
  }

  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  // Cron fires every 6 hours; ldap.sync_interval_hours (admin UI) is honoured
  // for values ABOVE 6h by skipping runs until the interval has elapsed.
  @Cron('0 */6 * * *')
  async scheduledSync() {
    try {
      const ldapEnabled = await this.configService.get('ldap', 'enabled');
      if (ldapEnabled === 'false') return;
      const url = await this.configService.get('ldap', 'url');
      if (!url) return;

      const rawInterval = await this.configService.get('ldap', 'sync_interval_hours');
      const intervalHours = rawInterval ? parseInt(rawInterval, 10) : 6;
      if (Number.isFinite(intervalHours) && intervalHours > 6 && this.syncStatus.lastSync) {
        const hoursSinceLast = (Date.now() - this.syncStatus.lastSync.getTime()) / (60 * 60 * 1000);
        if (hoursSinceLast < intervalHours - 0.5) return;
      }

      await this.syncUsers();
    } catch (err) {
      // The cron package does not catch rejected promises — never let this
      // escape as an unhandledRejection
      this.logger.error(`Sync LDAP planifiée en échec: ${(err as Error).stack ?? err}`);
    }
  }

  /**
   * Basic structural validation for LDAP filter strings.
   * Prevents null bytes and catches obvious injections from misconfigured admin panels.
   */
  validateLdapFilter(filter: string): void {
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

  // Re-entrancy guard: the 6h cron and the manual admin trigger must not run
  // two syncs concurrently (interleaved upserts + corrupted status)
  private syncInProgress = false;

  async syncUsers(): Promise<void> {
    if (this.syncInProgress) {
      this.logger.warn('LDAP sync skipped — une synchronisation est déjà en cours');
      return;
    }
    this.syncInProgress = true;
    this.logger.log('Starting LDAP sync...');
    let client: ldap.Client | null = null;

    try {
      const ldapEnabled = await this.configService.get('ldap', 'enabled');
      if (ldapEnabled === 'false') {
        this.logger.log('LDAP sync skipped — LDAP disabled in configuration');
        return;
      }

      client = await this.createClient();
      await this.bindClient(client);

      const searchBase = await this.configService.get('ldap', 'search_base') || '';
      // Default AD filter excludes disabled accounts (userAccountControl bit 2)
      const rawFilter = await this.configService.get('ldap', 'user_filter')
        || '(&(objectClass=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';
      this.validateLdapFilter(rawFilter);
      const filter = rawFilter;

      const syncStart = new Date();
      const users = await this.searchUsers(client, searchBase, filter);
      await this.upsertUsers(users);

      // Deactivate LDAP-sourced accounts that disappeared from the directory.
      // Scoped to previously-synced users (lastLdapSync < syncStart excludes the
      // NULLs of SSO-created accounts) and skipped on an empty search result —
      // an LDAP misconfiguration must not deactivate the whole company.
      if (users.length > 0) {
        const deactivated = await this.prisma.user.updateMany({
          where: {
            isLocalAccount: false,
            active: true,
            lastLdapSync: { lt: syncStart },
          },
          data: { active: false },
        });
        if (deactivated.count > 0) {
          this.logger.warn(`LDAP sync: ${deactivated.count} compte(s) absent(s) de l'annuaire désactivé(s)`);
        }
      }

      this.syncStatus = {
        lastSync: new Date(),
        lastSyncSuccess: true,
        lastSyncCount: users.length,
        lastSyncError: null,
      };

      this.logger.log(`LDAP sync complete: ${users.length} users processed`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.syncStatus = {
        lastSync: new Date(),
        lastSyncSuccess: false,
        lastSyncCount: null,
        lastSyncError: errMsg,
      };
      this.logger.error(`LDAP sync failed: ${errMsg}`);
    } finally {
      client?.destroy();
      this.syncInProgress = false;
    }
  }

  private async createClient(): Promise<ldap.Client> {
    const url = await this.configService.get('ldap', 'url');
    if (!url) throw new Error('URL LDAP non configurée');

    const useSsl = await this.configService.get('ldap', 'use_ssl');

    const client = ldap.createClient({
      url,
      // Always validate the LDAPS certificate: a NODE_ENV-dependent bypass left
      // staging/recette environments open to MITM on the bind credentials
      tlsOptions: useSsl === 'true' ? { rejectUnauthorized: true } : undefined,
      timeout: 10000,
      connectTimeout: 10000,
    });

    // Always attach an error handler to prevent unhandled 'error' event crashes.
    // Real connection errors will surface through the bind() callback.
    client.on('error', (err: Error) => {
      this.logger.warn(`LDAP client error (handled): ${err.message}`);
    });

    return client;
  }

  private async bindClient(client: ldap.Client): Promise<void> {
    const bindDn = await this.configService.get('ldap', 'bind_dn');
    const bindPassword = await this.configService.get('ldap', 'bind_password');

    if (!bindDn || !bindPassword) throw new Error('Bind DN ou mot de passe LDAP non configuré');

    return new Promise((resolve, reject) => {
      client.bind(bindDn, bindPassword, (err) => {
        if (err) reject(new Error(`LDAP bind failed: ${err.message}`));
        else resolve();
      });
    });
  }

  private searchUsers(client: ldap.Client, base: string, filter: string): Promise<LdapUser[]> {
    return new Promise((resolve, reject) => {
      const users: LdapUser[] = [];
      const options: ldap.SearchOptions = {
        filter,
        scope: 'sub',
        attributes: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName', 'department', 'company', 'title'],
      };

      client.search(base, options, (err, res) => {
        if (err) return reject(err);

        let totalEntries = 0;
        let skippedNoObj = 0;
        let skippedNoSam = 0;
        let skippedNoMail = 0;

        res.on('searchEntry', (entry) => {
          totalEntries++;

          // Lecture via entry.attributes (tableau ldapjs, fiable quelle que soit la version)
          // entry.object peut avoir des problèmes de casse ou de structure selon la version
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
          const attrs: LdapEntryAttribute[] = (entry as unknown as LdapSearchEntryExt).attributes || [];
          const attrMap: Record<string, string> = {};
          for (const attr of attrs) {
            const type: string = (attr.type || attr.attribute || '').toLowerCase();
            const vals: string[] = attr.vals || attr.values || attr._vals || [];
            if (type && vals.length > 0) {
              attrMap[type] = String(vals[0]);
            }
          }

          if (Object.keys(attrMap).length === 0) { skippedNoObj++; return; }

          const sam = attrMap['samaccountname'];
          // mail prioritaire, sinon userPrincipalName (toujours rempli en AD)
          const mail = attrMap['mail'] || attrMap['userprincipalname'];

          if (!sam) { skippedNoSam++; return; }
          if (!mail) {
            skippedNoMail++;
            this.logger.debug(`Skipped (no mail/UPN): ${sam}`);
            return;
          }

          const displayName = attrMap['displayname'] || '';
          // Exclure comptes machine (sam$) et comptes sans displayName (comptes système)
          if (sam.endsWith('$') || displayName === '') {
            this.logger.debug(`Skipped (compte système): ${sam}`);
            return;
          }

          // Exclure les emails non-routables (domaines internes AD : .local, .lan, .internal, etc.)
          const emailDomain = mail.split('@')[1]?.toLowerCase() ?? '';
          const nonRoutableTlds = ['.local', '.lan', '.internal', '.corp', '.localdomain', '.intranet', '.ad', '.home', '.domain'];
          if (nonRoutableTlds.some(tld => emailDomain.endsWith(tld))) {
            this.logger.debug(`Skipped (email non-routable ${mail}): ${sam}`);
            return;
          }

          users.push({
            sAMAccountName: sam,
            displayName,
            mail,
            department: attrMap['department'],
            company: attrMap['company'],
            title: attrMap['title'],
          });
        });

        res.on('error', reject);
        res.on('end', () => {
          this.logger.log(
            `LDAP search done — total: ${totalEntries}, importés: ${users.length}, ` +
            `sans objet: ${skippedNoObj}, sans sAMAccountName: ${skippedNoSam}, sans mail: ${skippedNoMail}`
          );
          resolve(users);
        });
      });
    });
  }

  private async upsertUsers(ldapUsers: LdapUser[]): Promise<void> {
    // Load all filiales for company matching
    const filiales = await this.prisma.filiale.findMany({ where: { active: true } });

    // Batch upsert in chunks of 50 to avoid N+1 individual queries
    const BATCH_SIZE = 50;
    for (let i = 0; i < ldapUsers.length; i += BATCH_SIZE) {
      const batch = ldapUsers.slice(i, i + BATCH_SIZE);
      await this.prisma.$transaction(
        batch.map((lu) => {
          const filiale = filiales.find(
            (f) => f.name.toLowerCase() === (lu.company || '').toLowerCase(),
          );
          return this.prisma.user.upsert({
            where: { samAccountName: lu.sAMAccountName },
            update: {
              displayName: lu.displayName,
              email: lu.mail,
              department: lu.department,
              company: lu.company,
              title: lu.title,
              filialeId: filiale?.id ?? null,
              lastLdapSync: new Date(),
              active: true,
            },
            create: {
              samAccountName: lu.sAMAccountName,
              displayName: lu.displayName,
              email: lu.mail,
              department: lu.department,
              company: lu.company,
              title: lu.title,
              filialeId: filiale?.id ?? null,
              lastLdapSync: new Date(),
              active: true,
              role: 'collaborator',
            },
          });
        }),
      );
    }
  }
}
