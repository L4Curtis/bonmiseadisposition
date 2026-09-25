import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { checkDatabase } from './monitoring/database-check.util';
import { Public } from './auth/decorators/public.decorator';

/** Sondes de santé (Docker, supervision) : ouvertes sans session. */
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return { status: 'ok' };
  }

  /**
   * Sonde de disponibilité RÉELLE (Docker healthcheck, Zabbix) : contrairement
   * à /health (toujours "ok" tant que le process répond), celle-ci vérifie
   * que la base répond via un SELECT 1 borné à 2 s. Endpoint public : aucun
   * détail d'erreur dans la réponse. Même politique de rate limiting globale
   * que /health (pas de garde spécifique ici, donc pas de @SkipThrottle).
   */
  @Get('ready')
  async ready() {
    const database = await checkDatabase(this.prisma);
    if (database === 'ok') {
      return { status: 'ok', database: 'ok' };
    }
    throw new HttpException({ status: 'error', database: 'unreachable' }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
