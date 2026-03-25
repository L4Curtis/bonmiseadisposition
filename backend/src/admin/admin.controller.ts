import {
  Controller, Get, Put, Post, Delete, Body, Param, UseGuards, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { BulkConfigValuesDto } from './dto/config.dto';
import { LdapService } from '../ldap/ldap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AppConfigService } from '../config/config.service';
import { SmbService } from '../smb/smb.service';

/** Clés autorisées par catégorie de configuration */
const ALLOWED_CONFIG_KEYS: Record<string, string[]> = {
  general: ['local_auth_enabled', 'app_name', 'default_filiale_id'],
  entra: ['tenant_id', 'client_id', 'client_secret', 'redirect_uri', 'admin_group_id', 'technician_group_id'],
  ldap: ['url', 'search_base', 'bind_dn', 'bind_password', 'user_filter', 'enabled', 'sync_interval_hours', 'use_ssl'],
  smtp: ['host', 'port', 'secure', 'user', 'password', 'from', 'from_name', 'from_address', 'method', 'graph_tenant_id', 'graph_client_id', 'graph_client_secret', 'graph_from_address'],
  smb: ['enabled', 'path', 'username', 'password', 'domain'],
  rappels: ['enabled', 'delay_1', 'delay_2', 'delay_3'],
  tokens: ['expiry_days'],
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

  // â”€â”€ Config CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Catégories réservées aux admins (contiennent des infos sensibles même masquées)
  private static readonly ADMIN_ONLY_CATEGORIES = ['entra', 'ldap', 'smtp', 'smb'];

  @Get('config/:category')
  async getConfig(@Param('category') category: string, @CurrentUser() user: any) {
    if (AdminController.ADMIN_ONLY_CATEGORIES.includes(category) && user?.role !== 'admin') {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }
    // Masque les secrets (bind_password, client_secret, smtp password) dans la réponse
    const data = await this.adminService.getConfigSection(category, { maskSecrets: true });
    return data;
  }

  @Put('config/:category')
  @Roles('admin')
  async setConfig(
    @Param('category') category: string,
    @Body() body: BulkConfigValuesDto,
    @CurrentUser() user: any,
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

    const encryptedKeys = getEncryptedKeys(category);
    await this.adminService.bulkSetConfig(category, body, encryptedKeys, user.id);
    return { ok: true };
  }

  // â”€â”€ Test endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ LDAP sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    smtp: ['password', 'graph_client_secret'],
    smb: ['password'],
  };
  return encryptedMap[category] || [];
}

