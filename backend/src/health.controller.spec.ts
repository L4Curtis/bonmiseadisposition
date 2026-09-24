import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';
import { createMockPrismaService } from './common/__tests__/helpers/mock-prisma';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    controller = new HealthController(prisma as unknown as PrismaService);
  });

  describe('check (GET /health)', () => {
    it('répond toujours "ok", sans vérifier la base', () => {
      expect(controller.check()).toEqual({ status: 'ok' });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('ready (GET /health/ready)', () => {
    it('répond 200 { status: ok, database: ok } quand la base répond', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      await expect(controller.ready()).resolves.toEqual({ status: 'ok', database: 'ok' });
    });

    it('répond 503 { status: error, database: unreachable } sans détail quand la base ne répond pas', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('mot de passe invalide pour l\'utilisateur app'));

      // Une résolution (pas d'exception) donnerait ici la valeur résolue, que
      // l'assertion suivante rejette : le test échoue dans les deux cas.
      const err = await controller.ready().then(
        (value) => value,
        (error: unknown) => error,
      );
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpErr.getResponse()).toEqual({ status: 'error', database: 'unreachable' });
    });
  });
});
