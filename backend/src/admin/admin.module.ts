import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { NotificationFailuresService } from './notification-failures.service';
import { SsoDiagnosticService } from './sso-diagnostic.service';
import { TemplatesController } from './templates.controller';
import { PdfTemplatesController } from './pdf-templates.controller';
import { LdapModule } from '../ldap/ldap.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SmbModule } from '../smb/smb.module';
import { PdfModule } from '../pdf/pdf.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  // NotificationModule : AdminService envoie l'alerte « départ avec matériel »
  // (lot D1) à la fin de purgeLdapUsers, même désactivation en masse que la
  // synchro LDAP — LdapModule ne le ré-exporte pas, import explicite ici.
  imports: [LdapModule, PrismaModule, SmbModule, PdfModule, NotificationModule],
  controllers: [AdminController, TemplatesController, PdfTemplatesController],
  providers: [AdminService, NotificationFailuresService, SsoDiagnosticService],
})
export class AdminModule {}
