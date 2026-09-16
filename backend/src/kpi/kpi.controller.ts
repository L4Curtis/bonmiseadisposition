import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { KpiQueryDto } from './dto/kpi-query.dto';
import { KpiCacheService } from './kpi-cache.service';
import { KpiParcService } from './kpi-parc.service';
import { KpiDelaisService } from './kpi-delais.service';
import { KpiIncidentsService } from './kpi-incidents.service';
import { resolvePeriod, KpiPeriod } from './kpi-period';
import { KpiParcResponse, KpiDelaisResponse, KpiIncidentsResponse } from './kpi-types';

/** Clé de cache partagée par les trois endpoints KPI — exportée pour être
 *  vérifiée telle quelle par les tests (indépendante du rôle appelant). */
export function cacheKey(endpoint: string, period: KpiPeriod, filialeId?: string): string {
  return `kpi:${endpoint}:${period.from}:${period.to}:${filialeId ?? ''}`;
}

/** Tableau de bord KPI : parc prêté, délais de traitement, incidents.
 *  Accessible à l'IT (admin, technician) et au rôle Direction (lecture seule). */
@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician', 'direction')
export class KpiController {
  constructor(
    private readonly cache: KpiCacheService,
    private readonly parcService: KpiParcService,
    private readonly delaisService: KpiDelaisService,
    private readonly incidentsService: KpiIncidentsService,
  ) {}

  @Get('parc')
  getParc(@Query() query: KpiQueryDto): Promise<KpiParcResponse> {
    const period = resolvePeriod(query);
    return this.cache.getOrCompute(cacheKey('parc', period, query.filialeId), () =>
      this.parcService.getParc(period, query.filialeId),
    );
  }

  @Get('delais')
  getDelais(@Query() query: KpiQueryDto): Promise<KpiDelaisResponse> {
    const period = resolvePeriod(query);
    return this.cache.getOrCompute(cacheKey('delais', period, query.filialeId), () =>
      this.delaisService.getDelais(period, query.filialeId),
    );
  }

  @Get('incidents')
  getIncidents(@Query() query: KpiQueryDto): Promise<KpiIncidentsResponse> {
    const period = resolvePeriod(query);
    return this.cache.getOrCompute(cacheKey('incidents', period, query.filialeId), () =>
      this.incidentsService.getIncidents(period, query.filialeId),
    );
  }
}
