import { Module } from '@nestjs/common';
import { BonsService } from './bons.service';
import { BonsController } from './bons.controller';
import { SignatureModule } from '../signature/signature.module';
import { NotificationModule } from '../notification/notification.module';
import { PdfModule } from '../pdf/pdf.module';
import { ContestationModule } from '../contestation/contestation.module';

@Module({
  imports: [SignatureModule, NotificationModule, PdfModule, ContestationModule],
  controllers: [BonsController],
  providers: [BonsService],
  exports: [BonsService],
})
export class BonsModule {}
