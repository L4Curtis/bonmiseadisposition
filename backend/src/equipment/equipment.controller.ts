import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import {
  CreateCatalogItemDto, UpdateCatalogItemDto,
  CreatePackDto, UpdatePackDto,
} from './dto/equipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// Catalogue et packs sont des données IT internes : lecture comme écriture
// réservées aux rôles admin/technician (les collaborateurs n'en ont pas l'usage)
@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

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
  createCatalogItem(@Body() dto: CreateCatalogItemDto) {
    return this.equipmentService.createCatalogItem(dto);
  }

  @Put('catalog/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  updateCatalogItem(@Param('id') id: string, @Body() dto: UpdateCatalogItemDto) {
    return this.equipmentService.updateCatalogItem(id, dto);
  }

  @Delete('catalog/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  removeCatalogItem(@Param('id') id: string) {
    return this.equipmentService.removeCatalogItem(id);
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
  createPack(@Body() dto: CreatePackDto) {
    return this.equipmentService.createPack(dto);
  }

  @Put('packs/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  updatePack(@Param('id') id: string, @Body() dto: UpdatePackDto) {
    return this.equipmentService.updatePack(id, dto);
  }

  @Delete('packs/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  removePack(@Param('id') id: string) {
    return this.equipmentService.removePack(id);
  }
}
