import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TemplatesController } from './templates.controller';
import { PdfTemplatesController } from './pdf-templates.controller';
import { LdapModule } from '../ldap/ldap.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SmbModule } from '../smb/smb.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [LdapModule, PrismaModule, SmbModule, PdfModule],
  controllers: [AdminController, TemplatesController, PdfTemplatesController],
  providers: [AdminService],
})
export class AdminModule {}
