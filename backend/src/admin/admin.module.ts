import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ConfigController } from './config.controller';
import { AdminLdapController } from './admin-ldap.controller';
import { AdminSmbController } from './admin-smb.controller';
import { ConfigSettingsService } from './config-settings.service';
import { ConnectionTestsService } from './connection-tests.service';
import { LdapAdminService } from './ldap-admin.service';
import { NotificationFailuresService } from './notification-failures.service';
import { SsoDiagnosticService } from './sso-diagnostic.service';
import { LdapModule } from '../ldap/ldap.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SmbModule } from '../smb/smb.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * Administration = réglages et exploitation : configuration et tests de
 * connexion, annuaire, copie réseau des PDF, supervision (statut, emails en
 * échec, diagnostic SSO). La rétention a son module (`retention/`), les
 * modèles le leur (`templates/`), les comptes utilisateurs aussi (`users/`).
 */
@Module({
  // NotificationModule : alerte « départ avec matériel » après une
  // désactivation en masse des comptes de l'annuaire (LdapAdminService).
  imports: [LdapModule, PrismaModule, SmbModule, NotificationModule],
  controllers: [AdminController, ConfigController, AdminLdapController, AdminSmbController],
  providers: [
    ConfigSettingsService,
    ConnectionTestsService,
    LdapAdminService,
    NotificationFailuresService,
    SsoDiagnosticService,
  ],
})
export class AdminModule {}
