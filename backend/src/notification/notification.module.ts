import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { BonEventsNotificationListener } from './listeners/bon-events.listener';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [NotificationService, BonEventsNotificationListener],
  exports: [NotificationService],
})
export class NotificationModule {}
