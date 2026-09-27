import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { KpiQueryDto } from './dto/kpi-query.dto';
import { KpiCacheService } from './kpi-cache.service';
import { KpiParcService } from './kpi-parc.service';
import { KpiDelaisService } from './kpi-delais.service';
import { KpiIncidentsService } from './kpi-incidents.service';
import { KpiTodayService } from './kpi-today.service';
import { KpiTodayResponse } from './today/today-types';
import { resolvePeriod, KpiPeriod } from './kpi-period';
import { KpiParcResponse, KpiDelaisResponse, KpiIncidentsResponse } from './kpi-types';
import { KpiListQueryDto } from './dto/kpi-list-query.dto';
import { KpiListService } from './lists/kpi-list.service';
import type { KpiListResponse } from '../contracts/kpi';

/** Clé de cache partagée par les trois endpoints KPI — exportée pour être
 *  vérifiée telle quelle par les tests (indépendante du rôle appelant). */
export function cacheKey(endpoint: string, period: KpiPeriod, filialeId?: string): string {
  return `kpi:${endpoint}:${period.from}:${period.to}:${filialeId ?? ''}`;
}

/** Tableau de bord : accueil IT (`aujourdhui`), parc, délais, incidents, et
 *  liste d'un chiffre (`liste`). Parc, délais et incidents : IT (admin,
 *  technician) et Direction (lecture seule) ; l'accueil et les listes : IT
 *  seulement. */
@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician', 'direction')
export class KpiController {
  constructor(
    private readonly cache: KpiCacheService,
    private readonly parcService: KpiParcService,
    private readonly delaisService: KpiDelaisService,
    private readonly incidentsService: KpiIncidentsService,
    private readonly todayService: KpiTodayService,
    private readonly listService: KpiListService,
  ) {}

  /** Accueil IT « Aujourd'hui » : états du jour, sans période ni cache (la
   *  tuile doit concorder avec la liste ouverte au moment du clic). La
   *  direction n'a pas cet onglet : ses lignes mènent à des bons. */
  @Get('aujourdhui')
  @Roles('admin', 'technician')
  getToday(): Promise<KpiTodayResponse> {
    return this.todayService.getToday();
  }

  /** Liste de ce que compte une carte « sur la période » (bons, PV, remises
   *  et clôtures sans signature, contestations, emails), pour la même période
   *  et la même filiale. IT seulement : chaque ligne mène à un bon. Jamais en
   *  cache, pour concorder avec le bon ouvert ensuite. */
  @Get('liste')
  @Roles('admin', 'technician')
  getList(@Query() query: KpiListQueryDto): Promise<KpiListResponse> {
    return this.listService.getList(query);
  }

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
