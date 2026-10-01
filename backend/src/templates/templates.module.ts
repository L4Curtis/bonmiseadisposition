import { Global, Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplateTestMailerService } from './template-test-mailer.service';
import { TemplateBonPreviewService } from './template-bon-preview.service';
import { EmailTemplatesController } from './email-templates.controller';
import { PdfTemplatesController } from '../pdf/pdf-templates.controller';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { PdfModule } from '../pdf/pdf.module';

/**
 * Modèles modifiables par l'administrateur : emails (`/email-templates`) et
 * documents PDF (`/pdf-templates`, contrôleur rangé avec le rendu PDF dans
 * `pdf/`). Global : le rendu des emails sert à toute l'application.
 */
@Global()
@Module({
  imports: [ConfigModule, PrismaModule, NotificationModule, PdfModule],
  controllers: [EmailTemplatesController, PdfTemplatesController],
  providers: [TemplatesService, TemplateTestMailerService, TemplateBonPreviewService],
  exports: [TemplatesService, TemplateTestMailerService],
})
export class TemplatesModule {}
