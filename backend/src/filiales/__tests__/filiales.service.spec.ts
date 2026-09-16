import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FilialesService } from '../filiales.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

/**
 * Une contrainte d'unicité insensible à la casse sur le nom de filiale a été
 * ajoutée en base (migration 20260916100400_unique_constraints, index
 * fonctionnel sur lower(name)). Sans traduction explicite, sa violation
 * remonterait comme un PrismaClientKnownRequestError (P2002) non catché —
 * un 500 générique côté API au lieu d'un message actionnable.
 */
describe('FilialesService — unique name constraint (P2002)', () => {
  let service: FilialesService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const p2002 = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new FilialesService(prisma as never);
  });

  describe('create', () => {
    it('translates a P2002 violation into a BadRequestException', async () => {
      (prisma.filiale.create as jest.Mock).mockRejectedValue(p2002());

      await expect(
        service.create({ name: 'Livio', displayName: 'Livio' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ name: 'Livio', displayName: 'Livio' }),
      ).rejects.toThrow('Une filiale avec ce nom existe déjà.');
    });

    it('rethrows any other error unchanged', async () => {
      (prisma.filiale.create as jest.Mock).mockRejectedValue(new Error('DB indisponible'));

      await expect(
        service.create({ name: 'Livio', displayName: 'Livio' }),
      ).rejects.toThrow('DB indisponible');
    });

    it('creates normally when the name is unique', async () => {
      (prisma.filiale.create as jest.Mock).mockResolvedValue({ id: 'f1', name: 'Livio' });

      const result = await service.create({ name: 'Livio', displayName: 'Livio' });

      expect(result).toEqual({ id: 'f1', name: 'Livio' });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      (prisma.filiale.findUnique as jest.Mock).mockResolvedValue({ id: 'f1', name: 'Livio-Paris' });
    });

    it('translates a P2002 violation into a BadRequestException', async () => {
      (prisma.filiale.update as jest.Mock).mockRejectedValue(p2002());

      await expect(service.update('f1', { name: 'Livio-Lyon' })).rejects.toThrow(BadRequestException);
      await expect(service.update('f1', { name: 'Livio-Lyon' })).rejects.toThrow(
        'Une filiale avec ce nom existe déjà.',
      );
    });

    it('rethrows any other error unchanged', async () => {
      (prisma.filiale.update as jest.Mock).mockRejectedValue(new Error('DB indisponible'));

      await expect(service.update('f1', { name: 'Livio-Lyon' })).rejects.toThrow('DB indisponible');
    });

    it('updates normally when the name is unique', async () => {
      (prisma.filiale.update as jest.Mock).mockResolvedValue({ id: 'f1', name: 'Livio-Lyon' });

      const result = await service.update('f1', { name: 'Livio-Lyon' });

      expect(result).toEqual({ id: 'f1', name: 'Livio-Lyon' });
    });
  });
});
