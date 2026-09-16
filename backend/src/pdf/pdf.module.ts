import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { PdfTemplatesService } from './pdf-templates.service';
import { PdfAdminController } from './pdf-admin.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PdfAdminController],
  providers: [PdfService, PdfTemplatesService],
  exports: [PdfService, PdfTemplatesService],
})
export class PdfModule {}
