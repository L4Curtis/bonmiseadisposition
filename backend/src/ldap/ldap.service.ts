import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as ldap from 'ldapjs';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobTrackerService, JobOutcome } from '../monitoring/job-tracker.service';
import { JOB_KEYS } from '../monitoring/job-registry';
import { translateLdapConnectionError } from './ldap-errors';
import { validateLdapFilterInput } from './ldap-filter-validator';
import { createLdapClient, bindLdapClient } from './ldap-connection';
import { searchLdapUsers } from './ldap-search';
import { LdapUser } from './ldap-entry-parser';
import { upsertLdapUsers } from './ldap-user-upsert';
import { deactivateAbsentLdapUsers } from './ldap-deactivation';

export interface SyncStatus {
  lastSync: Date | null;
  lastSyncSuccess: boolean | null;
  lastSyncCount: number | null;
  lastSyncError: string | null;
  /** Utilisateurs ignorés lors du dernier sync (collision d'email/identifiant — LOT C bug #6c). */
  lastSyncSkipped: number | null;
  /** true si la phase de désactivation a été annulée par le garde-fou (LOT C bug #7). */
  lastSyncAborted: boolean;
  /** Message à afficher côté UI quand lastSyncAborted est vrai (sinon null). */
  lastSyncWarning: string | null;
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);
  private syncStatus: SyncStatus = {
    lastSync: null,
    lastSyncSuccess: null,
    lastSyncCount: null,
    lastSyncError: null,
    lastSyncSkipped: null,
    lastSyncAborted: false,
    lastSyncWarning: null,
  };

  // Re-entrancy guard: the 6h cron and the manual admin trigger must not run
  // two syncs concurrently (interleaved upserts + corrupted status)
  private syncInProgress = false;

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly jobTracker: JobTrackerService,
  ) {}

  async testConnection(): Promise<{ success: boolean; message: string }> {
    let client: ldap.Client | null = null;
    try {
      client = await this.createClient();
      await this.bindClient(client);
      return { success: true, message: 'Connexion LDAP réussie' };
    } catch (err: unknown) {
      // Le détail technique brut (code TLS Node, message ldapjs...) reste dans
      // les journaux serveur ; l'admin ne voit que le message traduit
      // (translateLdapConnectionError), actionnable sans connaissance TLS.
      this.logger.warn(`Test de connexion LDAP en échec : ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      return { success: false, message: translateLdapConnectionError(err) };
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
      const url = await this.configService.get('ldap', 'url');
      const isDisabled = ldapEnabled === 'false' || !url;

      if (!isDisabled) {
        const rawInterval = await this.configService.get('ldap', 'sync_interval_hours');
        const intervalHours = rawInterval ? parseInt(rawInterval, 10) : 6;
        if (Number.isFinite(intervalHours) && intervalHours > 6 && this.syncStatus.lastSync) {
          const hoursSinceLast = (Date.now() - this.syncStatus.lastSync.getTime()) / (60 * 60 * 1000);
          if (hoursSinceLast < intervalHours - 0.5) {
            // Report volontaire (ldap.sync_interval_hours > 6h configuré par
            // l'admin) : un fonctionnement NORMAL, pas une désactivation —
            // sorti AVANT track() pour ne rien enregistrer. Un "skipped" ici
            // ferait afficher "Désactivée" côté admin alors que LDAP est
            // actif. MonitoringService recalcule le seuil "en retard" à
            // partir de ce même intervalle configuré (cf. monitoring.service.ts).
            return;
          }
        }
      }

      await this.jobTracker.track<void>(JOB_KEYS.LDAP_SYNC, async (): Promise<void | JobOutcome> => {
        if (isDisabled) return 'skipped';

        await this.syncUsers();
        // syncUsers() avale ses propres erreurs (this.syncStatus reflète le
        // résultat réel — cf. getSyncStatus()) sans jamais rejeter : sans ce
        // contrôle, le suivi enregistrerait "success" même en cas d'échec.
        if (this.syncStatus.lastSyncSuccess === false) {
          throw new Error(this.syncStatus.lastSyncError ?? 'Synchronisation LDAP en échec');
        }
      });
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
    validateLdapFilterInput(filter);
  }

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
      const users = await searchLdapUsers(client, searchBase, filter, this.logger);
      const { skipped } = await this.upsertUsers(users);

      // Deactivate LDAP-sourced accounts that disappeared from the directory.
      // Skipped entirely on an empty search result — an LDAP misconfiguration
      // must not deactivate the whole company. See deactivateAbsentUsers() for
      // the mass-deactivation guardrail (LOT C bug #7).
      const { aborted, abortMessage } = users.length > 0
        ? await this.deactivateAbsentUsers(syncStart)
        : { aborted: false, abortMessage: null };

      this.syncStatus = {
        lastSync: new Date(),
        lastSyncSuccess: true,
        lastSyncCount: users.length,
        // Le front affiche déjà lastSyncError tel quel — le message du
        // garde-fou (LOT C bug #7) y est donc dupliqué pour être visible sans
        // changement côté UI (lastSyncAborted/lastSyncWarning restent
        // disponibles pour un affichage dédié si le front veut les distinguer
        // d'une vraie erreur de sync).
        lastSyncError: abortMessage,
        lastSyncSkipped: skipped,
        lastSyncAborted: aborted,
        lastSyncWarning: abortMessage,
      };

      this.logger.log(`LDAP sync complete: ${users.length} users processed (${skipped} ignoré(s))`);
    } catch (err: unknown) {
      // Détail technique brut dans les journaux serveur uniquement ;
      // lastSyncError (affiché tel quel côté UI, cf. commentaire ci-dessus)
      // reçoit le message traduit par translateLdapConnectionError.
      const technicalDetail = err instanceof Error ? (err.stack ?? err.message) : String(err);
      const userMessage = translateLdapConnectionError(err);
      this.syncStatus = {
        lastSync: new Date(),
        lastSyncSuccess: false,
        lastSyncCount: null,
        lastSyncError: userMessage,
        lastSyncSkipped: null,
        lastSyncAborted: false,
        lastSyncWarning: null,
      };
      this.logger.error(`LDAP sync failed: ${technicalDetail}`);
    } finally {
      client?.destroy();
      this.syncInProgress = false;
    }
  }

  private async createClient(): Promise<ldap.Client> {
    const url = await this.configService.get('ldap', 'url');
    if (!url) throw new Error('URL LDAP non configurée');
    const useSsl = await this.configService.get('ldap', 'use_ssl');
    return createLdapClient(url, useSsl, this.logger);
  }

  private async bindClient(client: ldap.Client): Promise<void> {
    const bindDn = await this.configService.get('ldap', 'bind_dn');
    const bindPassword = await this.configService.get('ldap', 'bind_password');
    if (!bindDn || !bindPassword) throw new Error('Bind DN ou mot de passe LDAP non configuré');
    return bindLdapClient(client, bindDn, bindPassword);
  }

  private async upsertUsers(ldapUsers: LdapUser[]): Promise<{ skipped: number }> {
    return upsertLdapUsers(this.prisma, this.logger, ldapUsers);
  }

  private async deactivateAbsentUsers(syncStart: Date): Promise<{ aborted: boolean; abortMessage: string | null }> {
    return deactivateAbsentLdapUsers(this.prisma, this.logger, syncStart);
  }
}
