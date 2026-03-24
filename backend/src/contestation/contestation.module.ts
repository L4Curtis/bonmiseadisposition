import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { SignatureModule } from '../signature/signature.module';
import { ContestationService } from './contestation.service';
import { ContestationController } from './contestation.controller';

@Module({
  imports: [PrismaModule, NotificationModule, SignatureModule],
  providers: [ContestationService],
  controllers: [ContestationController],
  exports: [ContestationService],
})
export class ContestationModule {}
