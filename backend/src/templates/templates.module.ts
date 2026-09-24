import { Global, Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplateTestMailerService } from './template-test-mailer.service';
import { TemplateBonPreviewService } from './template-bon-preview.service';
import { TemplateBonPreviewController } from './template-bon-preview.controller';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, NotificationModule],
  // Aperçu et test avec un vrai bon (lot H3) : routes sous admin/email-templates,
  // à côté de celles d'admin/templates.controller.ts.
  controllers: [TemplateBonPreviewController],
  providers: [TemplatesService, TemplateTestMailerService, TemplateBonPreviewService],
  exports: [TemplatesService, TemplateTestMailerService],
})
export class TemplatesModule {}
