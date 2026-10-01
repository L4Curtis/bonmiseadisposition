import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { sendCsv } from '../common/csv';
import { clientIp } from '../common/http/client-ip';
import { toFullListResponse } from '../common/pagination';
import { HEAVY_EXPORT_THROTTLE } from '../common/throttle-limits';
import type { AuditActionsResponse, AuditListResponse } from '../contracts/audit';
import { AuditJournalService, AuditFilters } from './audit-journal.service';
import { AuditQueryDto } from './dto/audit-query.dto';

function filtersOf(query: AuditQueryDto): AuditFilters {
  const { bonId, user, userEmail, action, domain, dateFrom, dateTo } = query;
  return { bonId, user, userEmail, action, domain, dateFrom, dateTo };
}

/** Écran « Journal d'audit » : liste filtrée, export CSV. Réservé à l'administrateur. */
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditController {
  constructor(private readonly journal: AuditJournalService) {}

  /** GET /audit — liste paginée. Filtres : `user` (nom ou email de l'auteur ;
   *  `userEmail` reste accepté), `action`, `domain`, `dateFrom`/`dateTo`
   *  (AAAA-MM-JJ, jours civils à l'heure de Paris, bornes incluses), `bonId`. */
  @Get()
  findAll(@Query() query: AuditQueryDto): Promise<AuditListResponse> {
    return this.journal.list(filtersOf(query), query);
  }

  /** GET /audit/export — CSV lisible (dates de Paris, libellés, phrases) des
   *  entrées correspondant aux mêmes filtres, plafonné : un dépassement est
   *  signalé par l'en-tête `X-Truncated`, et annoncé à l'avance par
   *  `meta.exportTruncated` dans la réponse de GET /audit. Débit limité. */
  @Get('export')
  @Throttle(HEAVY_EXPORT_THROTTLE)
  async exportCsv(
    @Query() query: AuditQueryDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { csv, truncated } = await this.journal.exportCsv(filtersOf(query), { id: actor.id, ip: clientIp(req) });
    sendCsv(res, { filename: 'journal-audit', csv, truncated });
  }

  /** GET /audit/actions — actions présentes en base (filtres de l'écran). */
  @Get('actions')
  async getDistinctActions(): Promise<AuditActionsResponse> {
    return toFullListResponse(await this.journal.distinctActions());
  }
}
