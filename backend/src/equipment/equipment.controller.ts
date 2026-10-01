import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { EquipmentService } from './equipment.service';
import { EquipmentHistoryExportQueryDto, EquipmentHistoryQueryDto } from './dto/equipment-history-query.dto';
import {
  CreateCatalogItemDto, UpdateCatalogItemDto,
  CreatePackDto, UpdatePackDto, ImportCatalogDto,
} from './dto/equipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { DeprecatedAlias } from '../common/http/deprecated-alias';
import { sendCsv } from '../common/csv';
import { toFullListResponse, toListResponse } from '../common/pagination';

// Catalogue et packs sont des données IT internes : lecture comme écriture
// réservées aux rôles admin/technician, posés une fois sur la classe (les
// collaborateurs n'en ont pas l'usage) ; seul l'historique d'un équipement
// s'ouvre en plus à la direction.
@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  // ── Historique matériel (n° de série ou n° d'inventaire) ────

  /** GET /equipment/history?q=SN-1234&page=&limit= — une page des bons où ce
   *  matériel apparaît, identifié par son n° de série OU son n° d'inventaire
   *  (page /materiel/:reference). Ouvert à la direction, en lecture, comme
   *  l'inventaire. L'ancien chemin /equipment/serial-history reste servi par
   *  ce handler, en alias déprécié (common/http/deprecated-alias.ts). */
  @Get('history')
  @Roles('admin', 'technician', 'direction')
  @DeprecatedAlias('GET /equipment/serial-history')
  equipmentHistory(@Query() query: EquipmentHistoryQueryDto) {
    return this.equipmentService.getEquipmentHistory(query.q ?? '', query);
  }

  /** GET /equipment/history/export?q=SN-1234 — tout l'historique en CSV,
   *  `historique-equipement-AAAA-MM-JJ.csv` (date de Paris), `X-Truncated`
   *  au-delà du plafond de l'export. */
  @Get('history/export')
  @Roles('admin', 'technician', 'direction')
  async exportEquipmentHistory(@Query() query: EquipmentHistoryExportQueryDto, @Res() res: Response): Promise<void> {
    const { csv, truncated } = await this.equipmentService.getEquipmentHistoryCsv(query.q ?? '');
    sendCsv(res, { filename: 'historique-equipement', csv, truncated });
  }

  /** GET /equipment/serial-conflicts?serials=a,b&excludeBonId=… — n° déjà en
   *  circulation sur un autre bon (avertissement non bloquant), en une seule
   *  page ; `truncated` : plus de 50 numéros fournis, seuls les 50 premiers
   *  ont été vérifiés. */
  @Get('serial-conflicts')
  async serialConflicts(@Query('serials') serials: string, @Query('excludeBonId') excludeBonId?: string) {
    const list = (serials || '').split(',').map((s) => s.trim()).filter(Boolean);
    const { items, truncated } = await this.equipmentService.findSerialConflicts(list, excludeBonId || undefined);
    return toListResponse(items, { total: items.length, page: 1, limit: items.length, truncated });
  }

  // ── Catalogue ──────────────────────────────────────────────
  /** GET /equipment/catalog — tout le catalogue, articles désactivés compris,
   *  en une seule page. */
  @Get('catalog')
  async findAllCatalog() {
    return toFullListResponse(await this.equipmentService.findAllCatalog());
  }

  @Get('catalog/:id')
  findOneCatalog(@Param('id') id: string) {
    return this.equipmentService.findOneCatalog(id);
  }

  @Post('catalog')
  createCatalogItem(@Body() dto: CreateCatalogItemDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.createCatalogItem(dto, user.id);
  }

  /** POST /equipment/catalog/import — import en masse (max 500 lignes) :
   *  cf. equipment-catalog-import.ts pour le détail du contrat. */
  @Post('catalog/import')
  importCatalog(@Body() dto: ImportCatalogDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.importCatalog(dto, user.id);
  }

  @Put('catalog/:id')
  updateCatalogItem(@Param('id') id: string, @Body() dto: UpdateCatalogItemDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.updateCatalogItem(id, dto, user.id);
  }

  @Delete('catalog/:id')
  removeCatalogItem(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.equipmentService.removeCatalogItem(id, user.id);
  }

  // ── Packs ──────────────────────────────────────────────────
  /** GET /equipment/packs — tous les packs avec leurs articles, désactivés
   *  compris, en une seule page. */
  @Get('packs')
  async findAllPacks() {
    return toFullListResponse(await this.equipmentService.findAllPacks());
  }

  @Get('packs/:id')
  findOnePack(@Param('id') id: string) {
    return this.equipmentService.findOnePack(id);
  }

  @Post('packs')
  createPack(@Body() dto: CreatePackDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.createPack(dto, user.id);
  }

  @Put('packs/:id')
  updatePack(@Param('id') id: string, @Body() dto: UpdatePackDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.updatePack(id, dto, user.id);
  }

  @Delete('packs/:id')
  removePack(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.equipmentService.removePack(id, user.id);
  }
}
