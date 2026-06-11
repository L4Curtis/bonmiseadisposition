import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { SignatureModule } from '../signature/signature.module';
import { BonsModule } from '../bons/bons.module';
import { ContestationService } from './contestation.service';
import { ContestationController } from './contestation.controller';

@Module({
  // forwardRef : BonsModule importe ContestationModule (BonsController expose
  // /bons/:id/contestation) et le flux « corriger et re-signer » a besoin de
  // BonsService.duplicateAsDraft dans l'autre sens
  imports: [PrismaModule, NotificationModule, SignatureModule, forwardRef(() => BonsModule)],
  providers: [ContestationService],
  controllers: [ContestationController],
  exports: [ContestationService],
})
export class ContestationModule {}
