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
    try {
      const client = await this.createClient();
      await this.bindClient(client);
      client.destroy();
      return { success: true, message: 'Connexion LDAP réussie' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erreur de connexion LDAP' };
    }
  }

  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  // Default: every 6 hours. Can be made dynamic via config in future phases.
  @Cron('0 */6 * * *')
  async scheduledSync() {
    const ldapEnabled = await this.configService.get('ldap', 'enabled');
    if (ldapEnabled === 'false') return;
    const url = await this.configService.get('ldap', 'url');
    if (!url) return;
    await this.syncUsers();
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

  async syncUsers(): Promise<void> {
    this.logger.log('Starting LDAP sync...');
    const ldapEnabled = await this.configService.get('ldap', 'enabled');
    if (ldapEnabled === 'false') {
      this.logger.log('LDAP sync skipped — LDAP disabled in configuration');
      return;
    }
    let client: ldap.Client | null = null;

    try {
      client = await this.createClient();
      await this.bindClient(client);

      const searchBase = await this.configService.get('ldap', 'search_base') || '';
      const rawFilter = await this.configService.get('ldap', 'user_filter') || '(objectClass=person)';
      this.validateLdapFilter(rawFilter);
      const filter = rawFilter;

      const users = await this.searchUsers(client, searchBase, filter);
      await this.upsertUsers(users);

      this.syncStatus = {
        lastSync: new Date(),
        lastSyncSuccess: true,
        lastSyncCount: users.length,
        lastSyncError: null,
      };

      this.logger.log(`LDAP sync complete: ${users.length} users processed`);
    } catch (err: any) {
      this.syncStatus = {
        lastSync: new Date(),
        lastSyncSuccess: false,
        lastSyncCount: null,
        lastSyncError: err.message,
      };
      this.logger.error(`LDAP sync failed: ${err.message}`);
    } finally {
      client?.destroy();
    }
  }

  private async createClient(): Promise<ldap.Client> {
    const url = await this.configService.get('ldap', 'url');
    if (!url) throw new Error('URL LDAP non configurée');

    const useSsl = await this.configService.get('ldap', 'use_ssl');

    const client = ldap.createClient({
      url,
      tlsOptions: useSsl === 'true' ? { rejectUnauthorized: process.env.NODE_ENV === 'production' } : undefined,
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
          const attrs: any[] = (entry as any).attributes || [];
          const attrMap: Record<string, string> = {};
          for (const attr of attrs) {
            const type: string = (attr.type || attr.attribute || '').toLowerCase();
            const vals: any[] = attr.vals || attr.values || attr._vals || [];
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

    for (const lu of ldapUsers) {
      const filiale = filiales.find(
        (f) => f.name.toLowerCase() === (lu.company || '').toLowerCase(),
      );

      await this.prisma.user.upsert({
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
    }
  }
}
