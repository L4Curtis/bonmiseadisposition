import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Res, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { join, basename } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { FilialesService } from './filiales.service';
import { CreateFilialeDto, UpdateFilialeDto, ImportFilialesDto } from './dto/filiale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

@Controller('filiales')
@UseGuards(JwtAuthGuard)
export class FilialesController {
  constructor(private readonly filialesService: FilialesService) {}

  @Get()
  findAll() {
    return this.filialesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.filialesService.findActive();
  }

  /** GET /filiales/export?images=1 — CSV (BOM UTF-8, séparateur `;`) :
   *  nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64.
   *  Logo/cachet en base64 (sans préfixe data URL) uniquement si
   *  `images=1` — cf. filiales-csv.ts pour le détail du contrat. */
  @Get('export')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async exportCsv(@Query('images') images: string | undefined, @Res() res: Response) {
    const csv = await this.filialesService.exportCsv(images === '1');
    const filename = `filiales-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /** GET /filiales/import/template — même en-tête que l'export, plus deux
   *  lignes d'exemple commentées (cf. filiales-csv.ts). */
  @Get('import/template')
  @UseGuards(RolesGuard)
  @Roles('admin')
  importTemplate(@Res() res: Response) {
    const csv = this.filialesService.getImportTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="modele-import-filiales.csv"');
    res.send(csv);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filialesService.findOne(id);
  }

  // Serve uploaded files (sanitized to prevent path traversal)
  @Get('file/:filename')
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const safe = basename(filename);
    const fullPath = join(process.cwd(), 'data', 'uploads', safe);
    if (!existsSync(fullPath)) {
      return res.status(404).json({ message: 'Fichier introuvable' });
    }
    // Force download for SVG files to prevent stored XSS
    if (/\.svg$/i.test(safe)) {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Content-Type', 'text/plain');
    }
    return res.sendFile(fullPath);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  create(@Body() dto: CreateFilialeDto) {
    return this.filialesService.create(dto);
  }

  /** POST /filiales/import — import en masse (max 200 lignes) : cf.
   *  filiales-import.ts pour le détail exact du contrat. */
  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('admin')
  importFiliales(@Body() dto: ImportFilialesDto, @CurrentUser() user: AuthUser) {
    return this.filialesService.importFiliales(dto, user.id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  update(@Param('id') id: string, @Body() dto: UpdateFilialeDto) {
    return this.filialesService.update(id, dto);
  }

  @Patch(':id/logo')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    try {
      return await this.filialesService.updateLogo(id, file.filename);
    } catch (err) {
      // La filiale ciblée n'existe pas (ou autre échec) : multer a déjà écrit
      // le fichier sur disque avant l'appel du service — on le supprime pour
      // ne pas laisser de fichier orphelin.
      this.cleanupOrphanUpload(file.filename);
      throw err;
    }
  }

  @Patch(':id/stamp')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadStamp(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    try {
      return await this.filialesService.updateStamp(id, file.filename);
    } catch (err) {
      this.cleanupOrphanUpload(file.filename);
      throw err;
    }
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.filialesService.remove(id);
  }

  /** Supprime (best-effort) un fichier déjà écrit par multer quand l'upload échoue en aval (ex. filiale introuvable) — évite un fichier orphelin sur disque. */
  private cleanupOrphanUpload(filename: string): void {
    const fullPath = join(process.cwd(), 'data', 'uploads', basename(filename));
    try {
      if (existsSync(fullPath)) unlinkSync(fullPath);
    } catch {
      // best-effort : un fichier orphelin résiduel n'est pas bloquant
    }
  }
}
