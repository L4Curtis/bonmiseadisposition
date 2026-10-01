/**
 * Journal d'audit des filiales : chaque changement de l'écran Filiales est
 * tracé, cachet et logo compris, avec le nom de la filiale (`details.name`)
 * pour que la phrase du journal dise de quelle filiale il s'agit.
 */
import * as fs from 'fs';
import { FilialesService } from '../filiales.service';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { filialeChangeActions } from '../filiales-audit';
import type { Mock } from 'vitest';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: vi.fn().mockReturnValue(false),
  unlinkSync: vi.fn(),
}));

const ACTOR = { id: 'admin-1', ip: '10.0.0.7' };

function filiale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    name: 'livio-nord',
    displayName: 'Livio Nord',
    address: '1 rue du Nord',
    siret: null,
    active: true,
    logoPath: null,
    stampPath: 'uploads/ancien-cachet.png',
    ...overrides,
  };
}

describe('Audit des filiales', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: FilialesService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    // `filiale.delete` manque à la doublure commune : ajouté ici.
    (prisma.filiale as unknown as Record<string, Mock>).delete = vi.fn();
    const typed = prisma as unknown as PrismaService;
    service = new FilialesService(typed, new AuditService(typed));
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  function auditCalls(): { action: string; userId?: string; details?: Record<string, unknown>; ipAddress?: string }[] {
    return prisma.auditLog.create.mock.calls.map((call: unknown[]) => (call[0] as { data: never }).data);
  }

  it('création : filiale_created avec le nom', async () => {
    prisma.filiale.create.mockResolvedValue(filiale());

    await service.create({ name: 'livio-nord', displayName: 'Livio Nord' }, ACTOR);

    expect(auditCalls()).toEqual([
      { action: 'filiale_created', userId: 'admin-1', ipAddress: '10.0.0.7', details: { filialeId: 'f-1', name: 'Livio Nord' } },
    ]);
  });

  it('modification : filiale_updated avec les champs changés, sans les valeurs inchangées', async () => {
    prisma.filiale.findUnique.mockResolvedValue(filiale());
    prisma.filiale.update.mockResolvedValue(filiale({ address: '2 rue du Nord' }));

    await service.update('f-1', { address: '2 rue du Nord', displayName: 'Livio Nord' }, ACTOR);

    expect(auditCalls()).toEqual([
      expect.objectContaining({
        action: 'filiale_updated',
        details: { filialeId: 'f-1', name: 'Livio Nord', changedFields: ['address'] },
      }),
    ]);
  });

  it('désactivation puis réactivation : filiale_deactivated et filiale_reactivated', async () => {
    prisma.filiale.findUnique.mockResolvedValueOnce(filiale());
    prisma.filiale.update.mockResolvedValueOnce(filiale({ active: false }));
    await service.update('f-1', { active: false }, ACTOR);

    prisma.filiale.findUnique.mockResolvedValueOnce(filiale({ active: false }));
    prisma.filiale.update.mockResolvedValueOnce(filiale());
    await service.update('f-1', { active: true }, ACTOR);

    expect(auditCalls().map((c) => c.action)).toEqual(['filiale_deactivated', 'filiale_reactivated']);
  });

  it('aucun changement réel : rien n’est tracé', async () => {
    prisma.filiale.findUnique.mockResolvedValue(filiale());
    prisma.filiale.update.mockResolvedValue(filiale());

    await service.update('f-1', { displayName: 'Livio Nord', active: true }, ACTOR);

    expect(auditCalls()).toEqual([]);
  });

  it('cachet : filiale_stamp_updated ; logo : filiale_logo_updated', async () => {
    prisma.filiale.findUnique.mockResolvedValue(filiale());
    prisma.filiale.update.mockResolvedValue(filiale());

    await service.updateStamp('f-1', 'nouveau-cachet.png', ACTOR);
    await service.updateLogo('f-1', 'logo.png', ACTOR);

    expect(auditCalls()).toEqual([
      expect.objectContaining({ action: 'filiale_stamp_updated', details: { filialeId: 'f-1', name: 'Livio Nord', replaced: true } }),
      expect.objectContaining({ action: 'filiale_logo_updated', details: { filialeId: 'f-1', name: 'Livio Nord', replaced: false } }),
    ]);
  });

  it('suppression : filiale_deleted, le nom est gardé', async () => {
    prisma.filiale.findUnique.mockResolvedValue(filiale({ stampPath: null }));
    prisma.bon.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    (prisma.filiale as unknown as Record<string, Mock>).delete.mockResolvedValue(filiale());

    await service.remove('f-1', ACTOR);

    expect(auditCalls()).toEqual([
      expect.objectContaining({ action: 'filiale_deleted', details: { filialeId: 'f-1', name: 'Livio Nord' } }),
    ]);
  });

  it('suppression refusée (bons ou comptes rattachés) : 409 filiale_in_use, rien de tracé', async () => {
    prisma.filiale.findUnique.mockResolvedValue(filiale());
    prisma.bon.count.mockResolvedValue(2);
    prisma.user.count.mockResolvedValue(1);

    const err = await service.remove('f-1', ACTOR).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppException);
    expect(err).toMatchObject({ code: 'filiale_in_use', details: { bonCount: 2, userCount: 1 } });
    expect((err as AppException).getStatus()).toBe(409);
    expect((prisma.filiale as unknown as Record<string, Mock>).delete).not.toHaveBeenCalled();
    expect(auditCalls()).toEqual([]);
  });
});

describe('filialeChangeActions', () => {
  const before = filiale();

  it.each([
    [{ active: false }, ['filiale_deactivated']],
    [{ active: true }, []],
    [{ siret: '123', active: false }, ['filiale_deactivated', 'filiale_updated']],
    [{ name: 'livio-nord' }, []],
  ])('%j → %j', (dto, expected) => {
    expect(filialeChangeActions(before, dto).map((a) => a.action)).toEqual(expected);
  });
});
