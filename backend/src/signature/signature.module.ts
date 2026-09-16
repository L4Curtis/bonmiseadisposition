import { Module } from '@nestjs/common';
import { SignatureService } from './signature.service';
import { TimestampService } from './timestamp.service';
import { SignatureController } from './signature.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { NotificationModule } from '../notification/notification.module';
import { PdfModule } from '../pdf/pdf.module';
import { SmbModule } from '../smb/smb.module';

@Module({
  // AuthModule n'est pas nécessaire ici : JwtStrategy est déjà enregistré globalement
  // via AuthModule dans AppModule (Passport enregistre les stratégies globalement).
  // Pas d'import de BonsModule ici : SignatureService a besoin de
  // BonsService.emitPvClotureIfDue (hook PV après signature de restitution,
  // lot B) mais le résout PARESSEUSEMENT via ModuleRef.get(BonsService,
  // { strict: false }) au moment du hook — un forwardRef(() => BonsModule) ici
  // formait un cycle avec BonsModule → SignatureModule qui cassait le
  // démarrage réel de l'app (cf. src/__tests__/modules-boot.spec.ts).
  imports: [PrismaModule, ConfigModule, NotificationModule, PdfModule, SmbModule],
  controllers: [SignatureController],
  providers: [SignatureService, TimestampService],
  exports: [SignatureService],
})
export class SignatureModule {}
