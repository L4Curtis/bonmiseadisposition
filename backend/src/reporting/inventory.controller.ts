import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { InventoryService } from './inventory.service';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/** Vue « Inventaire du parc prêté » — équipements actuellement entre les
 *  mains des collaborateurs (accès IT : admin + technicien). */
@Controller('reporting/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Routes statiques AVANT la route racine paramétrée par query uniquement,
  // par cohérence avec le reste du code (cf. BonsController) même si aucun
  // conflit de path n'existe ici (pas de :id).
  @Get('summary')
  getSummary() {
    return this.inventoryService.getSummary();
  }

  @Get('export')
  async exportCsv(@Query() dto: InventoryQueryDto, @Res() res: Response) {
    const { csv, truncated } = await this.inventoryService.getExportCsv(dto);
    const filename = `inventaire-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (truncated) {
      res.setHeader('X-Truncated', 'true');
    }
    res.send(csv);
  }

  @Get()
  getInventory(@Query() dto: InventoryQueryDto) {
    return this.inventoryService.getInventory(dto);
  }
}
