import {
  Controller, Get, Put, Post, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { NotificationFailuresService, DEFAULT_NOTIFICATION_FAILURES_WINDOW_DAYS } from './notification-failures.service';
import { SsoDiagnosticService } from './sso-diagnostic.service';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { LdapService } from '../ldap/ldap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { AppConfigService } from '../config/config.service';
import { SmbService } from '../smb/smb.service';
import { MonitoringService } from '../monitoring/monitoring.service';

const MIN_NOTIFICATION_FAILURES_WINDOW_DAYS = 1;
const MAX_NOTIFICATION_FAILURES_WINDOW_DAYS = 365;

/** Clés autorisées par catégorie de configuration — chaque clé listée ici doit
 *  avoir un consommateur réel côté backend ET un champ côté UI. */
const ALLOWED_CONFIG_KEYS: Record<string, string[]> = {
  general: ['local_auth_enabled', 'app_url'],
  entra: [
    'tenant_id', 'client_id', 'client_secret', 'redirect_uri',
    'admin_group_id', 'technician_group_id', 'direction_group_id',
  ],
  ldap: ['url', 'search_base', 'bind_dn', 'bind_password', 'user_filter', 'enabled', 'sync_interval_hours', 'use_ssl'],
  smtp: ['host', 'port', 'secure', 'user', 'password', 'from'],
  smb: ['enabled', 'path', 'username', 'password', 'domain'],
  // restitution_before_days (défaut 7, à appliquer côté module notification) :
  // nombre de jours avant la date de restitution prévue à partir duquel un
  // rappel de restitution est envoyé. signature_overdue_days (défaut 7, min 1) :
  // seuil « en retard de signature », définition unique partagée par
  // /bons/stats, /bons?overdue=1 et /kpi/delais (common/bon-predicates).
  rappels: ['enabled', 'delay_1', 'delay_2', 'delay_3', 'restitution_before_days', 'signature_overdue_days'],
  tokens: ['expiry_days'],
  // Horodatage RFC 3161 optionnel des sceaux de signature
  timestamp: ['enabled', 'tsa_url'],
  // Rétention RGPD : anonymisation auto des bons clôturés/annulés anciens +
  // purge technique (tokens de signature expirés, vieux journaux d'audit)
  retention: ['enabled', 'anonymize_months', 'attachment_months', 'expired_tokens_days', 'audit_logs_years'],
};

const ALLOWED_CATEGORIES = Object.keys(ALLOWED_CONFIG_KEYS);

/** Bornes/format attendus pour les clés de configuration numériques ou
 *  formatées — validées à l'écriture (LOT C bug #10) plutôt que de laisser
 *  une valeur invalide échouer silencieusement à l'usage (parfois bien plus
 *  tard, ex. à la prochaine sync LDAP ou au prochain envoi de rappel). */
const INTEGER_CONFIG_RULES: Record<string, { min: number; max?: number }> = {
  'retention.anonymize_months': { min: 60 },
  'retention.attachment_months': { min: 1 },
  'retention.expired_tokens_days': { min: 1 },
  'retention.audit_logs_years': { min: 1 },
  'rappels.delay_1': { min: 1 },
  'rappels.delay_2': { min: 1 },
  'rappels.delay_3': { min: 1 },
  'rappels.restitution_before_days': { min: 0 },
  'rappels.signature_overdue_days': { min: 1 },
  'tokens.expiry_days': { min: 1, max: 30 },
  'smtp.port': { min: 1, max: 65535 },
};

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly ldapService: LdapService,
    private readonly configService: AppConfigService,
    private readonly smbService: SmbService,
    private readonly notificationFailuresService: NotificationFailuresService,
    private readonly ssoDiagnosticService: SsoDiagnosticService,
    private readonly monitoringService: MonitoringService,
  ) {}

  // Catégories réservées aux admins (infos sensibles ou impact réglementaire)
  private static readonly ADMIN_ONLY_CATEGORIES = ['entra', 'ldap', 'smtp', 'smb', 'timestamp', 'retention'];

  /** GET /admin/notifications/failed — emails en échec, migré depuis
   *  l'ancien module Reporting (supprimé). Déclaré avant `config/:category`
   *  par convention (routes statiques avant routes paramétrées). */
  @Get('notifications/failed')
  @Roles('admin')
  async getFailedNotifications(@Query('days') days?: string) {
    const parsed = days !== undefined ? parseInt(days, 10) : DEFAULT_NOTIFICATION_FAILURES_WINDOW_DAYS;
    const windowDays = Number.isFinite(parsed)
      ? Math.min(MAX_NOTIFICATION_FAILURES_WINDOW_DAYS, Math.max(MIN_NOTIFICATION_FAILURES_WINDOW_DAYS, parsed))
      : DEFAULT_NOTIFICATION_FAILURES_WINDOW_DAYS;
    return this.notificationFailuresService.getFailedNotifications(windowDays);
  }

  /** GET /admin/status — version/commit déployés, disponibilité de la base et
   *  dernier passage de chaque tâche planifiée (lot A5, supervision). */
  @Get('status')
  @Roles('admin')
  async getStatus() {
    return this.monitoringService.getAdminStatus();
  }

  /** GET /admin/sso/diagnostic — dernières connexions SSO et rôle attribué.
   *  Rend visible le cas « la personne est dans le groupe Entra mais n'obtient
   *  pas son rôle » (revendication de groupes non configurée, identifiant erroné). */
  @Get('sso/diagnostic')
  @Roles('admin')
  async getSsoDiagnostic(@Query('limit') limit?: string) {
    const parsed = limit !== undefined ? parseInt(limit, 10) : NaN;
    return this.ssoDiagnosticService.getRecent(Number.isFinite(parsed) ? parsed : undefined);
  }

  /** PATCH /admin/users/:id/role — changement manuel de rôle (admin). */
  @Patch('users/:id/role')
  @Roles('admin')
  async changeUserRole(
    @Param('id') id: string,
    @Body() dto: ChangeUserRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adminService.changeUserRole(id, dto.role, { id: user.id });
  }

  // ── SMB monitoring (MUST be declared before config/:category to avoid capture) ─
  @Get('smb/status')
  @Roles('admin')
  async smbStatus() {
    return this.smbService.getStatus();
  }

  @Get('smb/failed')
  @Roles('admin')
  async smbFailed() {
    return this.smbService.getFailedExports();
  }

  @Post('smb/retry/:id')
  @Roles('admin')
  async smbRetryOne(@Param('id') id: string) {
    const result = await this.smbService.retryOne(id);
    if (!result.success && result.error === 'SMB non activé') {
      throw new BadRequestException('SMB n\'est pas activé');
    }
    return result;
  }

  @Post('smb/retry-all')
  @Roles('admin')
  async smbRetryAll() {
    const enabled = await this.configService.get('smb', 'enabled');
    if (enabled !== 'true') {
      throw new BadRequestException('SMB n\'est pas activé');
    }
    return this.smbService.retryAllFailed();
  }

  // ── Config CRUD ───────────────────────────────────────────────────────────

  /** GET /admin/config/health — état par rubrique (configuré / incomplet /
   *  désactivé / non configuré), sans aucun secret. Déclaré AVANT
   *  config/:category pour ne pas être capturé comme category="health". */
  @Get('config/health')
  @Roles('admin')
  async getConfigHealth() {
    return this.adminService.getConfigHealth();
  }

  @Get('config/:category')
  async getConfig(@Param('category') category: string, @CurrentUser() user: AuthUser) {
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new BadRequestException(`Catégorie de configuration inconnue : ${category}`);
    }
    if (AdminController.ADMIN_ONLY_CATEGORIES.includes(category) && user?.role !== 'admin') {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }
    // Masque les secrets (bind_password, client_secret, smtp password) dans la réponse
    const data = await this.adminService.getConfigSection(category, { maskSecrets: true });
    // Pré-remplir l'URL publique avec la valeur effective (env FRONTEND_URL)
    // quand elle n'a pas encore été personnalisée en base. Réservé à l'admin :
    // lui seul peut écrire app_url (PUT @Roles('admin')).
    if (category === 'general' && user?.role === 'admin' && !data['app_url'] && process.env.FRONTEND_URL) {
      data['app_url'] = process.env.FRONTEND_URL;
    }
    return data;
  }

  @Put('config/:category')
  @Roles('admin')
  async setConfig(
    @Param('category') category: string,
    @Body() body: Record<string, string>,
    @CurrentUser() user: AuthUser,
  ) {
    // Valider la catégorie
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new BadRequestException(`Catégorie de configuration inconnue : ${category}`);
    }
    // Valider les clés
    const allowedKeys = ALLOWED_CONFIG_KEYS[category];
    const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
    if (unknownKeys.length > 0) {
      throw new BadRequestException(`Clé(s) non autorisée(s) pour la catégorie "${category}" : ${unknownKeys.join(', ')}`);
    }
    // Valider les valeurs : le body structurel (Record<string, string>) échappe
    // au ValidationPipe global — un objet/tableau finirait sérialisé en base
    const invalidValues = Object.entries(body).filter(([, v]) => typeof v !== 'string');
    if (invalidValues.length > 0) {
      throw new BadRequestException(
        `Valeur(s) invalide(s) (chaîne attendue) pour : ${invalidValues.map(([k]) => k).join(', ')}`,
      );
    }
    for (const [key, value] of Object.entries(body)) {
      if (value.length > 2000) {
        throw new BadRequestException(`Valeur trop longue pour la clé "${key}" (max 2000 caractères)`);
      }
    }

    // Décision produit (LOT C bug #11) : sans admin actif non local (SSO),
    // désactiver l'auth locale couperait tout accès administrateur.
    if (category === 'general' && body['local_auth_enabled'] === 'false') {
      await this.adminService.ensureNonLocalAdminExists();
    }

    // Validation par clé (bornes numériques, formats) + normalisation
    // (ex : trailing slash retiré de general.app_url) — LOT C bug #10.
    const validatedBody: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      validatedBody[key] = this.validateAndNormalizeConfigValue(category, key, value);
    }

    const encryptedKeys = getEncryptedKeys(category);
    await this.adminService.bulkSetConfig(category, validatedBody, encryptedKeys, user.id);
    return { ok: true };
  }

  /** Valide (et au besoin normalise) une valeur de configuration selon la clé
   *  ciblée. Ne fait rien pour les clés sans règle explicite (comportement
   *  inchangé pour les autres champs, non numériques/non formatés). */
  private validateAndNormalizeConfigValue(category: string, key: string, value: string): string {
    const fullKey = `${category}.${key}`;

    const integerRule = INTEGER_CONFIG_RULES[fullKey];
    if (integerRule) {
      return this.assertIntegerString(fullKey, value, integerRule);
    }

    if (fullKey === 'smtp.from') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!value || !emailRegex.test(value)) {
        throw new BadRequestException(`Valeur invalide pour "${fullKey}" : adresse email valide requise`);
      }
      return value;
    }

    if (fullKey === 'general.app_url') {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new BadRequestException(`Valeur invalide pour "${fullKey}" : URL http(s) valide attendue`);
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new BadRequestException(`Valeur invalide pour "${fullKey}" : URL http(s) valide attendue`);
      }
      return value.replace(/\/+$/, '');
    }

    if (fullKey === 'ldap.user_filter') {
      try {
        this.ldapService.validateLdapFilter(value);
      } catch (err) {
        throw new BadRequestException(`Valeur invalide pour "${fullKey}" : ${err instanceof Error ? err.message : 'filtre LDAP invalide'}`);
      }
      return value;
    }

    return value;
  }

  private assertIntegerString(fullKey: string, value: string, rule: { min: number; max?: number }): string {
    const n = Number(value);
    if (!Number.isInteger(n) || n < rule.min || (rule.max !== undefined && n > rule.max)) {
      const range = rule.max !== undefined ? `entre ${rule.min} et ${rule.max}` : `≥ ${rule.min}`;
      throw new BadRequestException(`Valeur invalide pour "${fullKey}" : un entier ${range} est attendu`);
    }
    return String(n);
  }

  // ── Test endpoints ────────────────────────────────────────────────────────
  @Post('config/test/ldap')
  @Roles('admin')
  async testLdap() {
    return this.ldapService.testConnection();
  }

  @Post('config/test/smtp')
  @Roles('admin')
  async testSmtp(@Body('testEmail') testEmail?: string) {
    return this.adminService.testSmtp(testEmail);
  }

  @Post('config/test/entra')
  @Roles('admin')
  async testEntra() {
    return this.adminService.testEntra();
  }

  @Post('config/test/smb')
  @Roles('admin')
  async testSmb() {
    return this.smbService.testConnection();
  }

  // ── LDAP sync ─────────────────────────────────────────────────────────────
  @Get('ldap/status')
  async ldapStatus() {
    return this.ldapService.getSyncStatus();
  }

  @Post('ldap/sync')
  @Roles('admin')
  async triggerLdapSync() {
    // Run in background, return immediately
    this.ldapService.syncUsers().catch((err: unknown) => {
      this.logger.error(`Synchronisation LDAP (déclenchée manuellement) en échec: ${(err as Error).message}`, (err as Error).stack);
    });
    return { ok: true, message: 'Synchronisation LDAP démarrée' };
  }

  @Delete('ldap/users')
  @Roles('admin')
  async purgeLdapUsers(@CurrentUser() user: AuthUser) {
    const result = await this.adminService.purgeLdapUsers(user.id);
    return { ok: true, message: `${result.deactivated} utilisateur(s) LDAP désactivé(s)` };
  }

  // ── Déverrouillage brute-force ───────────────────────────────────────────
  @Post('users/:id/unlock')
  @Roles('admin')
  async unlockUser(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.adminService.unlockUser(id, user.id);
  }
}

function getEncryptedKeys(category: string): string[] {
  const encryptedMap: Record<string, string[]> = {
    ldap: ['bind_password'],
    entra: ['client_secret'],
    smtp: ['password'],
    smb: ['password'],
  };
  return encryptedMap[category] || [];
}

