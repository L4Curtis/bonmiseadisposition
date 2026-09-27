import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { BonsModule } from '../bons/bons.module';
import { ContestationService } from './contestation.service';
import { ContestationController } from './contestation.controller';
import { ContestationOverdueService } from './overdue/contestation-overdue.service';
import { BON_CORRECTOR } from './bon-correction.port';
import { BonsService } from '../bons/bons.service';

/**
 * Sens unique : Contestation dépend de Bons (correction d'un bon contesté), Bons
 * ne connaît pas Contestation. La création d'une contestation, à l'adresse
 * `/bons/:id/contestation`, est servie par ContestationController.
 */
@Module({
  imports: [PrismaModule, NotificationModule, BonsModule],
  providers: [
    ContestationService,
    ContestationOverdueService,
    // La correction d'une contestation Fondée (bon remplaçant ou bon rouvert)
    // est faite par le module Bons.
    { provide: BON_CORRECTOR, useExisting: BonsService },
  ],
  controllers: [ContestationController],
  exports: [ContestationService],
})
export class ContestationModule {}
