import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as ldap from 'ldapjs';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../auth/utils/normalize-email.util';
import { JobTrackerService, JobOutcome } from '../monitoring/job-tracker.service';
import { JOB_KEYS } from '../monitoring/job-registry';
import { translateLdapConnectionError } from './ldap-errors';

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

  // Garde-fou anti désactivation massive (LOT C bug #7) : au-delà de ce ratio
  // ET de ce nombre absolu de comptes concernés, la sync interrompt la phase
  // de désactivation plutôt que de vider l'annuaire suite à un search_base ou
  // un user_filter mal saisi.
  private static readonly MASS_DEACTIVATION_RATIO_THRESHOLD = 0.2;
  private static readonly MASS_DEACTIVATION_MIN_COUNT = 5;

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

  /**
   * Désactive les comptes LDAP absents du dernier import (lastLdapSync <
   * syncStart), sauf si cela représenterait une part disproportionnée du parc
   * (LOT C bug #7) : au-delà de 20 % ET d'au moins 5 comptes, un
   * search_base/user_filter mal saisi ne doit pas vider l'annuaire — on
   * n'abandonne QUE cette phase, pas les créations/mises à jour déjà
   * appliquées par upsertUsers().
   */
  private async deactivateAbsentUsers(syncStart: Date): Promise<{ aborted: boolean; abortMessage: string | null }> {
    // isManualAccount: false explicite (LOT compagnons de chantier) : un
    // compte créé à la main (POST /users/manual) n'a jamais lastLdapSync
    // renseigné, donc `lastLdapSync: { lt: syncStart }` l'exclurait déjà
    // implicitement — l'exclusion ci-dessous reste posée en dur pour ne
    // jamais dépendre de cet effet de bord si le champ venait à être
    // renseigné par erreur ailleurs.
    const deactivationWhere = {
      isLocalAccount: false,
      isManualAccount: false,
      active: true,
      lastLdapSync: { lt: syncStart },
    };
    const toDeactivate = await this.prisma.user.count({ where: deactivationWhere });
    const activeLdapAccounts = await this.prisma.user.count({
      where: { isLocalAccount: false, isManualAccount: false, active: true, lastLdapSync: { not: null } },
    });
    const ratio = activeLdapAccounts > 0 ? toDeactivate / activeLdapAccounts : 0;

    const shouldAbort =
      toDeactivate >= LdapService.MASS_DEACTIVATION_MIN_COUNT &&
      ratio > LdapService.MASS_DEACTIVATION_RATIO_THRESHOLD;

    if (shouldAbort) {
      const abortMessage = `Sync interrompue : ${toDeactivate} comptes seraient désactivés (>20 %). Vérifiez search_base / user_filter.`;
      this.logger.error(
        `LDAP sync: désactivation annulée — ${toDeactivate}/${activeLdapAccounts} comptes ` +
        `(${Math.round(ratio * 100)}%) seraient désactivés`,
      );
      await this.prisma.auditLog.create({
        data: {
          action: 'ldap_sync_aborted',
          details: { toDeactivate, total: activeLdapAccounts, ratio },
        },
      }).catch((auditErr: unknown) => {
        this.logger.error(`Audit ldap_sync_aborted non journalisé: ${(auditErr as Error).message}`);
      });
      return { aborted: true, abortMessage };
    }

    const deactivated = await this.prisma.user.updateMany({
      where: deactivationWhere,
      data: { active: false },
    });
    if (deactivated.count > 0) {
      this.logger.warn(`LDAP sync: ${deactivated.count} compte(s) absent(s) de l'annuaire désactivé(s)`);
    }
    return { aborted: false, abortMessage: null };
  }

  private async createClient(): Promise<ldap.Client> {
    const url = await this.configService.get('ldap', 'url');
    if (!url) throw new Error('URL LDAP non configurée');

    const useSsl = await this.configService.get('ldap', 'use_ssl');

    // C'est le schéma de l'URL qui détermine RÉELLEMENT si la connexion est
    // chiffrée : ldapjs ouvre un socket TLS ou en clair selon `ldaps://` vs
    // `ldap://`, quoi que dise `use_ssl` — `use_ssl` ne fait qu'ajouter des
    // tlsOptions explicites. `ldaps://` implique donc toujours TLS ici.
    const isLdapsUrl = /^ldaps:\/\//i.test(url);

    // Incohérence dangereuse : l'admin croit avoir activé le chiffrement
    // (use_ssl=true) mais l'URL est restée en ldap:// (texte clair) — la
    // connexion ne serait PAS chiffrée malgré ce que la configuration laisse
    // penser. Comportement sûr retenu (décision LOT A6, cf. rapport) : refuser
    // de démarrer plutôt que de laisser croire à une connexion chiffrée qui ne
    // l'est pas. L'inverse (use_ssl=false avec une URL ldaps://) n'est pas une
    // incohérence dangereuse : l'URL suffit à chiffrer, tlsOptions ci-dessous
    // s'applique quand même.
    if (useSsl === 'true' && !isLdapsUrl) {
      throw new Error(
        "Configuration LDAP incohérente : SSL/TLS est activé mais l'URL LDAP ne commence pas par « ldaps:// ». " +
        'Utilisez une URL de la forme ldaps://<FQDN du contrôleur de domaine>:636.',
      );
    }

    const client = ldap.createClient({
      url,
      // Vérification du certificat TOUJOURS active dès que la connexion est
      // chiffrée (jamais rejectUnauthorized: false) : un bypass conditionnel
      // avait exposé le bind LDAP à une attaque MITM sur staging/recette.
      tlsOptions: isLdapsUrl ? { rejectUnauthorized: true } : undefined,
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
        // L'erreur brute (TLS, réseau ou protocolaire LDAP) est transmise
        // telle quelle, sans l'envelopper dans un nouveau Error : elle porte
        // les codes (`err.code`, `err.name`) dont translateLdapConnectionError
        // a besoin pour produire un message actionnable côté appelant.
        if (err) reject(err);
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
        // Pagination côté serveur (AD limite les résultats non paginés à 1000
        // entrées — sizeLimitExceeded faisait échouer toute la sync sur les
        // grands annuaires). ldapjs pilote automatiquement les pages
        // successives ; on compte juste les pages ici pour le log (LOT C bug #8).
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
            `sans objet: ${skippedNoObj}, sans sAMAccountName: ${skippedNoSam}, sans mail: ${skippedNoMail}, ` +
            `pages: ${Math.max(pageCount, 1)}`
          );
          resolve(users);
        });
      });
    });
  }

  /**
   * Upsert un par un (plus de transaction par lot de 50) : une collision
   * d'email/identifiant sur UN utilisateur n'annule plus tout le lot (LOT C
   * bug #6c). Recherche d'abord par email normalisé insensible à la casse —
   * SSO et LDAP peuvent avoir créé la même personne avec un sAMAccountName
   * différent (renommage AD, ancien compte SSO...) ; upserter directement par
   * sAMAccountName créerait alors un doublon et échouerait en P2002 sur
   * l'email.
   */
  private async upsertUsers(ldapUsers: LdapUser[]): Promise<{ skipped: number }> {
    // Load all filiales for company matching
    const filiales = await this.prisma.filiale.findMany({ where: { active: true } });
    let skipped = 0;

    for (const lu of ldapUsers) {
      const email = normalizeEmail(lu.mail);
      const filiale = filiales.find(
        (f) => f.name.toLowerCase() === (lu.company || '').toLowerCase(),
      );
      const data = {
        displayName: lu.displayName,
        email,
        department: lu.department,
        company: lu.company,
        title: lu.title,
        filialeId: filiale?.id ?? null,
        lastLdapSync: new Date(),
        active: true,
      };

      try {
        const existingByEmail = await this.prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });

        // Un compte manuel (POST /users/manual, compagnon de chantier sans
        // compte AD) ne doit jamais être désactivé, modifié ni écrasé par la
        // synchronisation — même s'il partage l'email d'une fiche annuaire
        // (ex. le compagnon obtient ensuite un vrai compte AD). On l'ignore
        // plutôt que de le fusionner/écraser : une éventuelle fusion reste
        // une décision manuelle de l'administrateur.
        if (existingByEmail?.isManualAccount) {
          skipped++;
          this.logger.warn(
            `LDAP sync: ${lu.sAMAccountName} (${email}) correspond à un compte manuel existant — ignoré (jamais écrasé par la synchronisation)`,
          );
          continue;
        }

        if (existingByEmail && existingByEmail.samAccountName !== lu.sAMAccountName) {
          // Même personne (même email), identifiant AD différent : on met à
          // jour l'enregistrement existant plutôt que d'upserter par
          // sAMAccountName, ce qui créerait un doublon + P2002 sur l'email.
          await this.prisma.user.update({ where: { id: existingByEmail.id }, data });
        } else {
          // Garde-fou symétrique côté sAMAccountName (collision en théorie
          // impossible — les comptes manuels sont préfixés "manuel." — mais
          // vérifiée explicitement plutôt que supposée).
          const existingBySam = await this.prisma.user.findUnique({
            where: { samAccountName: lu.sAMAccountName },
          });
          if (existingBySam?.isManualAccount) {
            skipped++;
            this.logger.warn(
              `LDAP sync: sAMAccountName ${lu.sAMAccountName} correspond à un compte manuel existant — ignoré (jamais écrasé par la synchronisation)`,
            );
            continue;
          }
          await this.prisma.user.upsert({
            where: { samAccountName: lu.sAMAccountName },
            update: data,
            create: { ...data, samAccountName: lu.sAMAccountName, role: 'collaborator' },
          });
        }
      } catch (err: unknown) {
        skipped++;
        const isUniqueConstraintViolation =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (isUniqueConstraintViolation) {
          this.logger.warn(
            `LDAP sync: collision d'email/identifiant pour ${lu.sAMAccountName} (${email}) — utilisateur ignoré, synchronisation poursuivie`,
          );
        } else {
          this.logger.error(
            `LDAP sync: échec de la mise à jour pour ${lu.sAMAccountName} (${email}): ${(err as Error).message}`,
          );
        }
      }
    }

    return { skipped };
  }
}
