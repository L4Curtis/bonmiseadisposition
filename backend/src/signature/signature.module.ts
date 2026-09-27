import { Module } from '@nestjs/common';
import { SignatureService } from './signature.service';
import { TimestampService } from './timestamp.service';
import { SignatureController } from './signature.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { NotificationModule } from '../notification/notification.module';
import { PdfModule } from '../pdf/pdf.module';
import { SmbModule } from '../smb/smb.module';
import { WithoutSignatureDocumentsListener } from './without-signature-documents.listener';

@Module({
  // Aucun import de BonsModule : la signature annonce `signature.signed`
  // (common/events) et le cycle de vie du bon y réagit, sans dépendance.
  // AuthModule est inutile ici : Passport enregistre ses stratégies globalement.
  imports: [PrismaModule, ConfigModule, NotificationModule, PdfModule, SmbModule],
  controllers: [SignatureController],
  providers: [SignatureService, TimestampService, WithoutSignatureDocumentsListener],
  exports: [SignatureService],
})
export class SignatureModule {}
