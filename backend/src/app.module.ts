import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { LdapModule } from './ldap/ldap.module';
import { FilialesModule } from './filiales/filiales.module';
import { EquipmentModule } from './equipment/equipment.module';
import { UsersModule } from './users/users.module';
import { NotificationModule } from './notification/notification.module';
import { SignatureModule } from './signature/signature.module';
import { BonsModule } from './bons/bons.module';
import { AuditModule } from './audit/audit.module';
import { ContestationModule } from './contestation/contestation.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Rate limiting global : 60 req / 60s par IP (surcharge par endpoint si besoin)
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60000,  // 1 minute en ms
      limit: 60,
    }]),
    PrismaModule,
    ConfigModule,
    AuthModule,
    AdminModule,
    LdapModule,
    FilialesModule,
    EquipmentModule,
    UsersModule,
    NotificationModule,
    SignatureModule,
    BonsModule,
    AuditModule,
    ContestationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
