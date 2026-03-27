import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { PdfTemplatesService } from './pdf-templates.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PdfService, PdfTemplatesService],
  exports: [PdfService, PdfTemplatesService],
})
export class PdfModule {}
