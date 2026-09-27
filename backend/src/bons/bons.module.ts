import { Module } from '@nestjs/common';
import { BonsService } from './bons.service';
import { BonsController } from './bons.controller';
import { BonSignatureListener } from './bon-signature.listener';
import { SignatureModule } from '../signature/signature.module';
import { NotificationModule } from '../notification/notification.module';
import { PdfModule } from '../pdf/pdf.module';
import { SmbModule } from '../smb/smb.module';

/**
 * Module du cycle de vie des bons. Les suites d'une signature arrivent par
 * l'événement `signature.signed` (BonSignatureListener) : SignatureModule ne
 * dépend pas de ce module.
 *
 * Bons ne dépend pas de Contestation : `POST /bons/:id/contestation` est
 * servie par ContestationController, qui importe ce module (bon remplaçant).
 */
@Module({
  imports: [SignatureModule, NotificationModule, PdfModule, SmbModule],
  controllers: [BonsController],
  providers: [BonsService, BonSignatureListener],
  exports: [BonsService],
})
export class BonsModule {}
