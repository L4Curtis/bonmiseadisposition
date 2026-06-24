import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportingService } from './reporting.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('overview')
  getOverview() {
    return this.reporting.getOverview();
  }

  @Get('circulating.csv')
  async circulatingCsv(@Res() res: Response) {
    const csv = await this.reporting.getCirculatingCsv();
    const filename = `parc-en-circulation-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
