import { forwardRef, Module } from '@nestjs/common';
import { BonsService } from './bons.service';
import { BonsController } from './bons.controller';
import { SignatureModule } from '../signature/signature.module';
import { NotificationModule } from '../notification/notification.module';
import { PdfModule } from '../pdf/pdf.module';
import { ContestationModule } from '../contestation/contestation.module';
import { SmbModule } from '../smb/smb.module';

@Module({
  // SignatureModule est importé normalement (pas de forwardRef) : le besoin
  // inverse (SignatureService → BonsService.emitPvClotureIfDue, lot B) est
  // résolu via ModuleRef paresseux côté SignatureService, pas par un import de
  // module — ça évite de former un cycle avec SignatureModule.
  imports: [SignatureModule, NotificationModule, PdfModule, forwardRef(() => ContestationModule), SmbModule],
  controllers: [BonsController],
  providers: [BonsService],
  exports: [BonsService],
})
export class BonsModule {}
