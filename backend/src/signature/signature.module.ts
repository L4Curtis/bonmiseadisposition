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
  imports: [PrismaModule, ConfigModule, NotificationModule, PdfModule, SmbModule],
  controllers: [SignatureController],
  providers: [SignatureService, TimestampService],
  exports: [SignatureService],
})
export class SignatureModule {}
