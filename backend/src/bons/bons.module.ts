import { forwardRef, Module } from '@nestjs/common';
import { BonsService } from './bons.service';
import { BONS_SERVICE } from './bons.tokens';
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
  // Alias par jeton : permet à SignatureService de résoudre BonsService sans
  // importer la classe (cycle de fichiers, cf. bons.tokens.ts).
  providers: [BonsService, { provide: BONS_SERVICE, useExisting: BonsService }],
  exports: [BonsService, BONS_SERVICE],
})
export class BonsModule {}
