import { Logger } from '@nestjs/common';
import {
  DEPARTURE_NOTIFIED_ACTION,
  getInactiveCollaborateurGroups,
  notifyDepartures,
} from '../departure-notifications';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { PARC_BON_STATUSES } from '../../common/bon-predicates';
import type { Mock } from 'vitest';

function makeGroupRow(overrides: Record<string, unknown> = {}) {
  return {
    bon: {
      dateMiseDisposition: new Date('2026-01-10'),
      dateRestitution: null,
      collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT', active: false },
      filiale: { id: 'f-1', displayName: 'Paris' },
      ...overrides,
    },
  };
}

function silentLogger(): Logger {
  const logger = new Logger('test');
  vi.spyOn(logger, 'log').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  return logger;
}

describe('getInactiveCollaborateurGroups', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
  });

  it('restreint le prédicat parc en circulation aux comptes désactivés', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([]);

    await getInactiveCollaborateurGroups(prisma as never, new Date('2026-09-21'));

    const call = (prisma.bonEquipment.findMany as Mock).mock.calls[0][0];
    expect(call.where.AND).toContainEqual({ returnedAt: null });
    expect(call.where.AND).toContainEqual({ notReturned: false });
    expect(call.where.AND).toContainEqual({ bon: { status: { in: [...PARC_BON_STATUSES] } } });
    expect(call.where.AND).toContainEqual({ bon: { collaborateur: { active: false } } });
  });

  it('regroupe les lignes renvoyées par collaborateur (réutilise groupInventoryByCollaborateur)', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeGroupRow(), makeGroupRow()]);

    const result = await getInactiveCollaborateurGroups(prisma as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ collaborateurId: 'u-1', count: 2, active: false });
  });

  it("renvoie un tableau vide quand aucun compte désactivé ne détient de matériel", async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([]);

    const result = await getInactiveCollaborateurGroups(prisma as never);

    expect(result).toEqual([]);
  });
});

describe('notifyDepartures', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let logger: Logger;
  let sendAlert: Mock;

  beforeEach(() => {
    prisma = createMockPrismaService();
    logger = silentLogger();
    sendAlert = vi.fn().mockResolvedValue(true);
  });

  it("n'envoie rien et ne journalise rien quand aucun compte désactivé ne détient de matériel", async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([]);

    await notifyDepartures({ prisma: prisma as never, logger, sendAlert });

    expect(sendAlert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('envoie une alerte pour un collaborateur jamais notifié, puis journalise departure_notified', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeGroupRow()]);
    (prisma.auditLog.findMany as Mock).mockResolvedValue([]); // jamais notifié
    (prisma.user.findMany as Mock).mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-01') }]);

    await notifyDepartures({ prisma: prisma as never, logger, sendAlert }, new Date('2026-09-21'));

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith([expect.objectContaining({ collaborateurId: 'u-1' })]);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { action: DEPARTURE_NOTIFIED_ACTION, details: { collaborateurId: 'u-1', equipmentCount: 1 } },
    });
  });

  it('ne renvoie jamais deux fois pour la même personne (déjà notifiée depuis sa désactivation)', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeGroupRow()]);
    // Désactivé le 1er septembre, notifié le 2 — aucune notification depuis.
    (prisma.auditLog.findMany as Mock).mockResolvedValue([
      { details: { collaborateurId: 'u-1' }, createdAt: new Date('2026-09-02') },
    ]);
    (prisma.user.findMany as Mock).mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-01') }]);

    await notifyDepartures({ prisma: prisma as never, logger, sendAlert }, new Date('2026-09-21'));

    expect(sendAlert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('envoie une nouvelle alerte après une réactivation puis une nouvelle désactivation', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeGroupRow()]);
    // Notifié le 2 septembre (1er épisode), puis réactivé/redésactivé le 15 :
    // updatedAt (15) est postérieur à la dernière notification (2) → à renotifier.
    (prisma.auditLog.findMany as Mock).mockResolvedValue([
      { details: { collaborateurId: 'u-1' }, createdAt: new Date('2026-09-02') },
    ]);
    (prisma.user.findMany as Mock).mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-15') }]);

    await notifyDepartures({ prisma: prisma as never, logger, sendAlert }, new Date('2026-09-21'));

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: DEPARTURE_NOTIFIED_ACTION }) }),
    );
  });

  it("ne journalise pas quand l'envoi échoue, pour retenter au prochain passage", async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([makeGroupRow()]);
    (prisma.auditLog.findMany as Mock).mockResolvedValue([]);
    (prisma.user.findMany as Mock).mockResolvedValue([{ id: 'u-1', updatedAt: new Date('2026-09-01') }]);
    sendAlert.mockResolvedValue(false);

    await notifyDepartures({ prisma: prisma as never, logger, sendAlert }, new Date('2026-09-21'));

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('ne notifie que les collaborateurs dus quand plusieurs sont concernés', async () => {
    (prisma.bonEquipment.findMany as Mock).mockResolvedValue([
      makeGroupRow(),
      makeGroupRow({ collaborateur: { id: 'u-2', displayName: 'Alice Martin', email: 'a@x.fr', department: 'RH', active: false } }),
    ]);
    (prisma.auditLog.findMany as Mock).mockResolvedValue([
      // u-1 déjà notifié depuis sa désactivation ; u-2 jamais notifié.
      { details: { collaborateurId: 'u-1' }, createdAt: new Date('2026-09-05') },
    ]);
    (prisma.user.findMany as Mock).mockResolvedValue([
      { id: 'u-1', updatedAt: new Date('2026-09-01') },
      { id: 'u-2', updatedAt: new Date('2026-09-10') },
    ]);

    await notifyDepartures({ prisma: prisma as never, logger, sendAlert }, new Date('2026-09-21'));

    expect(sendAlert).toHaveBeenCalledWith([expect.objectContaining({ collaborateurId: 'u-2' })]);
  });
});
