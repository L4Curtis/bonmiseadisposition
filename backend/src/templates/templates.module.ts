import { Global, Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplateTestMailerService } from './template-test-mailer.service';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, NotificationModule],
  providers: [TemplatesService, TemplateTestMailerService],
  exports: [TemplatesService, TemplateTestMailerService],
})
export class TemplatesModule {}
