import { Global, Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
