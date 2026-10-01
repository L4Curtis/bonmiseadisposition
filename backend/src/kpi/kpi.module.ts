import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { KpiController } from './kpi.controller';
import { KpiCacheService } from './kpi-cache.service';
import { KpiParcService } from './kpi-parc.service';
import { KpiDelaisService } from './kpi-delais.service';
import { KpiIncidentsService } from './kpi-incidents.service';
import { KpiTodayService } from './kpi-today.service';
import { KpiListService } from './lists/kpi-list.service';
import { KpiExportService } from './export/kpi-export.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [KpiController],
  providers: [KpiCacheService, KpiParcService, KpiDelaisService, KpiIncidentsService, KpiTodayService, KpiListService,
    KpiExportService],
})
export class KpiModule {}
