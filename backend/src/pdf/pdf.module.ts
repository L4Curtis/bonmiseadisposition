import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
