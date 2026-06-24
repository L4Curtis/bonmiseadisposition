import {
  Controller, Get, Put, Post, Delete, Body, Param, UseGuards, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { LdapService } from '../ldap/ldap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { AppConfigService } from '../config/config.service';
import { SmbService } from '../smb/smb.service';

/** Clés autorisées par catégorie de configuration — chaque clé listée ici doit
 *  avoir un consommateur réel côté backend ET un champ côté UI. */
const ALLOWED_CONFIG_KEYS: Record<string, string[]> = {
  general: ['local_auth_enabled', 'app_url'],
  entra: ['tenant_id', 'client_id', 'client_secret', 'redirect_uri', 'admin_group_id', 'technician_group_id'],
  ldap: ['url', 'search_base', 'bind_dn', 'bind_password', 'user_filter', 'enabled', 'sync_interval_hours', 'use_ssl'],
  smtp: ['host', 'port', 'secure', 'user', 'password', 'from'],
  smb: ['enabled', 'path', 'username', 'password', 'domain'],
  rappels: ['enabled', 'delay_1', 'delay_2', 'delay_3'],
  tokens: ['expiry_days'],
  // Horodatage RFC 3161 optionnel des sceaux de signature
  timestamp: ['enabled', 'tsa_url'],
  // Rétention RGPD : anonymisation auto des bons clôturés/annulés anciens
  retention: ['enabled', 'anonymize_months', 'attachment_months'],
};

const ALLOWED_CATEGORIES = Object.keys(ALLOWED_CONFIG_KEYS);

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly ldapService: LdapService,
    private readonly configService: AppConfigService,
    private readonly smbService: SmbService,
  ) {}

  // Catégories réservées aux admins (infos sensibles ou impact réglementaire)
  private static readonly ADMIN_ONLY_CATEGORIES = ['entra', 'ldap', 'smtp', 'smb', 'timestamp', 'retention'];

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

  @Get('config/:category')
  async getConfig(@Param('category') category: string, @CurrentUser() user: AuthUser) {
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

    const encryptedKeys = getEncryptedKeys(category);
    await this.adminService.bulkSetConfig(category, body, encryptedKeys, user.id);
    return { ok: true };
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
    this.ldapService.syncUsers().catch(() => {});
    return { ok: true, message: 'Synchronisation LDAP démarrée' };
  }

  @Delete('ldap/users')
  @Roles('admin')
  async purgeLdapUsers() {
    const result = await this.adminService.purgeLdapUsers();
    return { ok: true, message: `${result.deleted} utilisateur(s) LDAP purgé(s)` };
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

