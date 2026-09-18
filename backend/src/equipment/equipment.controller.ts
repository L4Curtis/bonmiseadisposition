import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import {
  CreateCatalogItemDto, UpdateCatalogItemDto,
  CreatePackDto, UpdatePackDto, ImportCatalogDto,
} from './dto/equipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';

// Catalogue et packs sont des données IT internes : lecture comme écriture
// réservées aux rôles admin/technician (les collaborateurs n'en ont pas l'usage)
@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  // ── Numéros de série ───────────────────────────────────────

  /** GET /equipment/serial-history?q=SN-1234 — tous les bons où ce n° apparaît */
  @Get('serial-history')
  serialHistory(@Query('q') q: string) {
    return this.equipmentService.getSerialHistory(q || '');
  }

  /** GET /equipment/serial-conflicts?serials=a,b&excludeBonId=… — n° déjà en
   *  circulation sur un autre bon (avertissement non bloquant) */
  @Get('serial-conflicts')
  serialConflicts(
    @Query('serials') serials: string,
    @Query('excludeBonId') excludeBonId?: string,
  ) {
    const list = (serials || '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.equipmentService.findSerialConflicts(list, excludeBonId || undefined);
  }

  // ── Catalogue ──────────────────────────────────────────────
  @Get('catalog')
  findAllCatalog() {
    return this.equipmentService.findAllCatalog();
  }

  @Get('catalog/search')
  searchCatalog(@Query('q') q: string) {
    return this.equipmentService.searchCatalog(q || '');
  }

  @Get('catalog/active')
  findActiveCatalog() {
    return this.equipmentService.findActiveCatalog();
  }

  @Get('catalog/:id')
  findOneCatalog(@Param('id') id: string) {
    return this.equipmentService.findOneCatalog(id);
  }

  @Post('catalog')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  createCatalogItem(@Body() dto: CreateCatalogItemDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.createCatalogItem(dto, user.id);
  }

  /** POST /equipment/catalog/import — import en masse (max 500 lignes) :
   *  cf. equipment-catalog-import.ts pour le détail du contrat. */
  @Post('catalog/import')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  importCatalog(@Body() dto: ImportCatalogDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.importCatalog(dto, user.id);
  }

  @Put('catalog/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  updateCatalogItem(@Param('id') id: string, @Body() dto: UpdateCatalogItemDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.updateCatalogItem(id, dto, user.id);
  }

  @Delete('catalog/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  removeCatalogItem(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.equipmentService.removeCatalogItem(id, user.id);
  }

  // ── Packs ──────────────────────────────────────────────────
  @Get('packs')
  findAllPacks() {
    return this.equipmentService.findAllPacks();
  }

  @Get('packs/active')
  findActivePacks() {
    return this.equipmentService.findActivePacks();
  }

  @Get('packs/:id')
  findOnePack(@Param('id') id: string) {
    return this.equipmentService.findOnePack(id);
  }

  @Post('packs')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  createPack(@Body() dto: CreatePackDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.createPack(dto, user.id);
  }

  @Put('packs/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  updatePack(@Param('id') id: string, @Body() dto: UpdatePackDto, @CurrentUser() user: AuthUser) {
    return this.equipmentService.updatePack(id, dto, user.id);
  }

  @Delete('packs/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  removePack(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.equipmentService.removePack(id, user.id);
  }
}
