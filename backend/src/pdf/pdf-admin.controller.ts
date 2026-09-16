import { Controller, Post, UseGuards } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Opérations d'administration liées aux PDF de preuve. Placé dans le module
 * pdf (et non backend/src/admin, hors périmètre) : voir pdf.service.ts pour
 * la logique de régénération.
 */
@Controller('admin/pdf')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PdfAdminController {
  constructor(private readonly pdfService: PdfService) {}

  /** Régénère les PdfSnapshot manquants pour les signatures déjà signées. */
  @Post('regenerate-missing')
  @Roles('admin')
  regenerateMissing() {
    return this.pdfService.regenerateMissingSnapshots();
  }
}
