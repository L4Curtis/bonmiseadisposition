import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { LdapModule } from '../ldap/ldap.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SmbModule } from '../smb/smb.module';

@Module({
  imports: [LdapModule, PrismaModule, SmbModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
