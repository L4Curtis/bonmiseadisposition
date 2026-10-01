import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import { join } from 'path';
import { FilialesService } from '../filiales.service';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors';
import { DATA_DIR } from '../../common/storage-paths';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

const ACTOR = { id: 'admin-1' };

// Doublures du disque : aucun test ne touche au dossier data/ du poste.
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

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
    service = new FilialesService(prisma as never, new AuditService(prisma as never));
  });

  describe('create', () => {
    it('translates a P2002 violation into a 409 filiale_name_taken', async () => {
      (prisma.filiale.create as Mock).mockRejectedValue(p2002());

      await expect(
        service.create({ name: 'Livio', displayName: 'Livio' }, ACTOR),
      ).rejects.toThrow(AppException);
      await expect(
        service.create({ name: 'Livio', displayName: 'Livio' }, ACTOR),
      ).rejects.toThrow('Une filiale avec ce nom existe déjà.');
    });

    it('rethrows any other error unchanged', async () => {
      (prisma.filiale.create as Mock).mockRejectedValue(new Error('DB indisponible'));

      await expect(
        service.create({ name: 'Livio', displayName: 'Livio' }, ACTOR),
      ).rejects.toThrow('DB indisponible');
    });

    it('creates normally when the name is unique', async () => {
      (prisma.filiale.create as Mock).mockResolvedValue({ id: 'f1', name: 'Livio' });

      const result = await service.create({ name: 'Livio', displayName: 'Livio' }, ACTOR);

      expect(result).toEqual({ id: 'f1', name: 'Livio' });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      (prisma.filiale.findUnique as Mock).mockResolvedValue({ id: 'f1', name: 'Livio-Paris' });
    });

    it('translates a P2002 violation into a 409 filiale_name_taken', async () => {
      (prisma.filiale.update as Mock).mockRejectedValue(p2002());

      await expect(service.update('f1', { name: 'Livio-Lyon' }, ACTOR)).rejects.toThrow(AppException);
      await expect(service.update('f1', { name: 'Livio-Lyon' }, ACTOR)).rejects.toThrow(
        'Une filiale avec ce nom existe déjà.',
      );
    });

    it('rethrows any other error unchanged', async () => {
      (prisma.filiale.update as Mock).mockRejectedValue(new Error('DB indisponible'));

      await expect(service.update('f1', { name: 'Livio-Lyon' }, ACTOR)).rejects.toThrow('DB indisponible');
    });

    it('updates normally when the name is unique', async () => {
      (prisma.filiale.update as Mock).mockResolvedValue({ id: 'f1', name: 'Livio-Lyon' });

      const result = await service.update('f1', { name: 'Livio-Lyon' }, ACTOR);

      expect(result).toEqual({ id: 'f1', name: 'Livio-Lyon' });
    });
  });
});

describe('FilialesService.findActive — identité seulement', () => {
  it('ne charge ni le cachet, ni le logo, ni l’adresse des filiales actives', async () => {
    const prisma = createMockPrismaService();
    (prisma.filiale.findMany as Mock).mockResolvedValue([]);
    await new FilialesService(prisma as never, new AuditService(prisma as never)).findActive();
    expect(prisma.filiale.findMany).toHaveBeenCalledWith({
      where: { active: true },
      select: { id: true, name: true, displayName: true, active: true },
      orderBy: { displayName: 'asc' },
    });
  });
});

describe('FilialesService — suppression de l’ancien logo ou cachet', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: FilialesService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new FilialesService(prisma as never, new AuditService(prisma as never));
    (fs.existsSync as Mock).mockReset().mockReturnValue(true);
    (fs.unlinkSync as Mock).mockReset();
    (prisma.filiale.update as Mock).mockResolvedValue({ id: 'f1' });
  });

  it('supprime l’ancien fichier, rangé sous data/', async () => {
    (prisma.filiale.findUnique as Mock).mockResolvedValue({ id: 'f1', logoPath: 'uploads/ancien.png' });

    await service.updateLogo('f1', 'nouveau.png', ACTOR);

    expect(fs.unlinkSync).toHaveBeenCalledWith(join(DATA_DIR, 'uploads', 'ancien.png'));
    expect(prisma.filiale.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { logoPath: 'uploads/nouveau.png' } });
  });

  it('garde l’ancien cachet si l’enregistrement du nouveau échoue', async () => {
    (prisma.filiale.findUnique as Mock).mockResolvedValue({ id: 'f1', stampPath: 'uploads/ancien.png' });
    (prisma.filiale.update as Mock).mockRejectedValue(new Error('DB indisponible'));

    await expect(service.updateStamp('f1', 'nouveau.png', ACTOR)).rejects.toThrow('DB indisponible');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('garde logo et cachet si la suppression de la filiale échoue en base', async () => {
    (prisma.filiale.findUnique as Mock).mockResolvedValue({
      id: 'f1', displayName: 'Livio', logoPath: 'uploads/logo.png', stampPath: 'uploads/cachet.png',
    });
    (prisma.bon.count as Mock).mockResolvedValue(0);
    (prisma.user.count as Mock).mockResolvedValue(0);
    Object.assign(prisma.filiale, { delete: vi.fn().mockRejectedValue(new Error('DB indisponible')) });

    await expect(service.remove('f1', ACTOR)).rejects.toThrow('DB indisponible');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it.each(['../../.env', 'uploads/../../etc/passwd'])(
    'ne supprime jamais un fichier hors de data/, même si la base y pointe (%s)',
    async (outside) => {
      (prisma.filiale.findUnique as Mock).mockResolvedValue({ id: 'f1', stampPath: outside });

      await service.updateStamp('f1', 'nouveau.png', ACTOR);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(prisma.filiale.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { stampPath: 'uploads/nouveau.png' } });
    },
  );
});
