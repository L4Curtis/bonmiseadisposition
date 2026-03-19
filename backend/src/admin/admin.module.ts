import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { LdapModule } from '../ldap/ldap.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [LdapModule, PrismaModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
