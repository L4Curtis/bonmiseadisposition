import { Module } from '@nestjs/common';
import { SignatureService } from './signature.service';
import { SignatureController } from './signature.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { NotificationModule } from '../notification/notification.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  // AuthModule n'est pas nécessaire ici : JwtStrategy est déjà enregistré globalement
  // via AuthModule dans AppModule (Passport enregistre les stratégies globalement).
  imports: [PrismaModule, ConfigModule, NotificationModule, PdfModule],
  controllers: [SignatureController],
  providers: [SignatureService],
  exports: [SignatureService],
})
export class SignatureModule {}
