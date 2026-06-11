import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { parsePositiveInt } from '../common/query-utils';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query('bonId') bonId?: string,
    @Query('userEmail') userEmail?: string,
    @Query('action') action?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    for (const [name, value] of [['dateFrom', dateFrom], ['dateTo', dateTo]] as const) {
      if (value && Number.isNaN(new Date(value).getTime())) {
        throw new BadRequestException(`Paramètre ${name} invalide (date attendue)`);
      }
    }
    return this.auditService.findAll({
      bonId,
      userEmail,
      action,
      dateFrom,
      dateTo,
      page: parsePositiveInt(page, 1),
      limit: parsePositiveInt(limit, 50, 100),
    });
  }

  @Get('actions')
  getDistinctActions() {
    return this.auditService.getDistinctActions();
  }
}
