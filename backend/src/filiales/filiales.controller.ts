import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Req, Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { join, basename } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { FilialeActor, FilialesService } from './filiales.service';
import { CreateFilialeDto, UpdateFilialeDto, ImportFilialesDto } from './dto/filiale.dto';
import { FilialesExportQueryDto } from './dto/filiales-export-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { AppException } from '../common/errors';
import { sendCsv } from '../common/csv';
import { clientIp } from '../common/http/client-ip';
import { UPLOADS_DIR } from '../common/storage-paths';
import { assertFilialeImageFile } from './filiales-image';

function actorOf(user: AuthUser, req: Request): FilialeActor {
  return { id: user.id, ip: clientIp(req) };
}

function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new AppException('file_missing', 'Aucun fichier fourni.');
  return file;
}

/**
 * Filiales. Leur gestion (création, modification, cachet, logo, désactivation,
 * import, export) est réservée à l'administrateur : c'est le rôle posé sur la
 * classe. Seule la liste des filiales ACTIVES, réduite à leur identité, sert
 * aussi aux filtres et formulaires de l'IT et de la direction. Le collaborateur
 * n'a aucune route ici : le nom de la filiale lui parvient avec ses bons.
 *
 * Les fichiers déposés (logos, cachets) ne sont servis par aucune route : ils
 * ne sortent du serveur qu'imprimés sur les PDF.
 */
@Controller('filiales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class FilialesController {
  constructor(private readonly filialesService: FilialesService) {}

  /** GET /filiales — toutes les filiales, actives et désactivées. */
  @Get()
  findAll() {
    return this.filialesService.findAll();
  }

  /** GET /filiales/active — `{ id, name, displayName, active }` des filiales
   *  actives : filtres (bons, inventaire, tableau de bord) et formulaires. */
  @Get('active')
  @Roles('admin', 'technician', 'direction')
  findActive() {
    return this.filialesService.findActive();
  }

  /** GET /filiales/export?images=1&status=active — CSV (BOM UTF-8,
   *  séparateur `;`) nommé `filiales-AAAA-MM-JJ.csv`, daté du jour à Paris :
   *  nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64.
   *  Logo/cachet en base64 (sans préfixe data URL) uniquement si
   *  `images=1` ; `status=active` retient les seules filiales actives, comme
   *  l'écran — cf. filiales-csv.ts pour le détail du contrat. */
  @Get('export')
  async exportCsv(@Query() query: FilialesExportQueryDto, @Res() res: Response): Promise<void> {
    const csv = await this.filialesService.exportCsv({ includeImages: query.images === '1', activeOnly: query.status === 'active' });
    sendCsv(res, { filename: 'filiales', csv });
  }

  /** GET /filiales/import/template — même en-tête que l'export, plus deux
   *  lignes d'exemple commentées (cf. filiales-csv.ts). */
  @Get('import/template')
  importTemplate(@Res() res: Response): void {
    sendCsv(res, { filename: 'modele-import-filiales', csv: this.filialesService.getImportTemplate(), dated: false });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filialesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateFilialeDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.filialesService.create(dto, actorOf(user, req));
  }

  /** POST /filiales/import — import en masse (max 200 lignes) : cf.
   *  filiales-import.ts pour le détail exact du contrat. */
  @Post('import')
  importFiliales(@Body() dto: ImportFilialesDto, @CurrentUser() user: AuthUser) {
    return this.filialesService.importFiliales(dto, user.id);
  }

  /** PUT /filiales/:id — fiche, désactivation (`active: false`) et
   *  réactivation, chacune tracée au journal. */
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFilialeDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.filialesService.update(id, dto, actorOf(user, req));
  }

  /** PATCH /filiales/:id/logo — PNG ou JPEG, vérifié sur ses premiers
   *  octets (400 `unsupported_image` sinon, comme un mauvais format). */
  @Patch(':id/logo')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() upload: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.replaceImage(upload, (filename) => this.filialesService.updateLogo(id, filename, actorOf(user, req)));
  }

  /** PATCH /filiales/:id/stamp — même contrôle que le logo. */
  @Patch(':id/stamp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  uploadStamp(
    @Param('id') id: string,
    @UploadedFile() upload: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.replaceImage(upload, (filename) => this.filialesService.updateStamp(id, filename, actorOf(user, req)));
  }

  /** DELETE /filiales/:id — suppression réelle d'une filiale sans bon ni
   *  compte rattaché (409 `filiale_in_use` sinon). */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.filialesService.remove(id, actorOf(user, req));
  }

  /**
   * Enregistre un logo ou un cachet déjà écrit sur disque par multer, après
   * en avoir vérifié le type réel. Tout échec (fichier qui n'est pas une
   * image, filiale introuvable…) supprime le fichier : rien d'orphelin.
   */
  private async replaceImage<T>(upload: Express.Multer.File | undefined, save: (filename: string) => Promise<T>): Promise<T> {
    const file = requireFile(upload);
    try {
      await assertFilialeImageFile(join(UPLOADS_DIR, basename(file.filename)));
      return await save(file.filename);
    } catch (err) {
      this.cleanupOrphanUpload(file.filename);
      throw err;
    }
  }

  /** Supprime (au mieux) le fichier déjà écrit par multer quand l'enregistrement
   *  échoue ensuite (filiale introuvable…) : pas de fichier orphelin sur disque. */
  private cleanupOrphanUpload(filename: string): void {
    const fullPath = join(UPLOADS_DIR, basename(filename));
    try {
      if (existsSync(fullPath)) unlinkSync(fullPath);
    } catch {
      // Au pire, un fichier orphelin reste sur le disque : rien de bloquant.
    }
  }
}
