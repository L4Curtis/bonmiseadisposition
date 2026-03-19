import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { ContestationService } from './contestation.service';
import { ContestationController } from './contestation.controller';

@Module({
  imports: [PrismaModule, NotificationModule],
  providers: [ContestationService],
  controllers: [ContestationController],
  exports: [ContestationService],
})
export class ContestationModule {}
