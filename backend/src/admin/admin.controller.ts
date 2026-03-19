import {
  Controller, Get, Put, Post, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { LdapService } from '../ldap/ldap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AppConfigService } from '../config/config.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly ldapService: LdapService,
    private readonly configService: AppConfigService,
  ) {}

  // â”€â”€ Config CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  @Get('config/:category')
  async getConfig(@Param('category') category: string) {
    // Masque les secrets (bind_password, client_secret, smtp password) dans la réponse
    const data = await this.adminService.getConfigSection(category, { maskSecrets: true });
    return data;
  }

  @Put('config/:category')
  @Roles('admin')
  async setConfig(
    @Param('category') category: string,
    @Body() body: Record<string, string>,
    @CurrentUser() user: any,
  ) {
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
  };
  return encryptedMap[category] || [];
}

