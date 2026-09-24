import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { AuditService } from './audit.service';
import { parsePositiveInt } from '../common/query-utils';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** GET /audit — liste paginée. Filtres : `user` (nom ou email de l'auteur ;
   *  `userEmail` reste accepté), `action`, `dateFrom`/`dateTo` (AAAA-MM-JJ,
   *  jours civils à l'heure de Paris, bornes incluses), `bonId`. */
  @Get()
  findAll(
    @Query('bonId') bonId?: string,
    @Query('user') user?: string,
    @Query('userEmail') userEmail?: string,
    @Query('action') action?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAll({
      bonId,
      user,
      userEmail,
      action,
      dateFrom,
      dateTo,
      page: parsePositiveInt(page, 1),
      limit: parsePositiveInt(limit, 50, 100),
    });
  }

  /** GET /audit/export — CSV (BOM UTF-8, séparateur `;`) des entrées
   *  correspondant aux mêmes filtres que la liste, plafonné (cf.
   *  audit-csv.ts#AUDIT_EXPORT_MAX_ROWS) : un dépassement est signalé par
   *  l'en-tête `X-Truncated: true` (même convention que l'export de
   *  l'inventaire), et annoncé à l'avance par `exportTruncated` dans la
   *  réponse de GET /audit. */
  @Get('export')
  async exportCsv(
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
    @Query('bonId') bonId?: string,
    @Query('user') user?: string,
    @Query('userEmail') userEmail?: string,
    @Query('action') action?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const { csv, truncated } = await this.auditService.exportCsv(
      { bonId, user, userEmail, action, dateFrom, dateTo },
      actor.id,
    );
    const filename = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (truncated) {
      res.setHeader('X-Truncated', 'true');
    }
    res.send(csv);
  }

  @Get('actions')
  getDistinctActions() {
    return this.auditService.getDistinctActions();
  }
}
