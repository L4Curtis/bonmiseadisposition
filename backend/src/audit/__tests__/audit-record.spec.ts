import { Logger } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { AUDIT_USER_AGENT_MAX_LENGTH, writeAuditEntry } from '../audit-record';
import { auditSentence, isAuditAction } from '../audit-actions';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

describe('writeAuditEntry — seul point d’écriture du journal', () => {
  it('écrit l’action et ses colonnes, avec les noms de la table', async () => {
    const prisma = createMockPrismaService();
    await writeAuditEntry(prisma, 'bon_cancelled', {
      actorId: 'u-1',
      actorEmail: 'tech@livio.fr',
      bonId: 'bon-1',
      details: { previousStatus: 'active', reason: 'Doublon' },
      ip: '203.0.113.7',
      userAgent: 'Firefox',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'bon_cancelled',
        userId: 'u-1',
        userEmail: 'tech@livio.fr',
        bonId: 'bon-1',
        details: { previousStatus: 'active', reason: 'Doublon' },
        ipAddress: '203.0.113.7',
        userAgent: 'Firefox',
      },
    });
  });

  it('n’écrit que les colonnes renseignées (entrée du système, sans auteur)', async () => {
    const prisma = createMockPrismaService();
    await writeAuditEntry(prisma, 'attachments_purged', { details: { count: 3 } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { action: 'attachments_purged', details: { count: 3 } } });
  });

  it('tronque un user-agent démesuré (en-tête libre)', async () => {
    const prisma = createMockPrismaService();
    await writeAuditEntry(prisma, 'logout', { actorId: 'u-1', userAgent: 'x'.repeat(5000) });
    const { data } = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as { data: { userAgent: string } };
    expect(data.userAgent).toHaveLength(AUDIT_USER_AGENT_MAX_LENGTH);
  });

  it('écrit dans la transaction reçue, pour qu’une entrée suive le sort de l’opération', async () => {
    const tx = { auditLog: { create: vi.fn().mockResolvedValue({}) } };
    await writeAuditEntry(tx, 'bon_created', { actorId: 'u-1', bonId: 'bon-1' });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it('refuse une action absente du catalogue (erreur de programmation)', async () => {
    const prisma = createMockPrismaService();
    await expect(writeAuditEntry(prisma, 'action_inventee' as never, {})).rejects.toThrow('catalogue');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('AuditService.record et recordSafely', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: AuditService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new AuditService(prisma as unknown as PrismaService);
  });

  it('record écrit par Prisma, ou par la transaction donnée', async () => {
    await service.record('logout', { actorId: 'u-1' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { action: 'logout', userId: 'u-1' } });

    const tx = { auditLog: { create: vi.fn().mockResolvedValue({}) } };
    await service.record('logout', { actorId: 'u-2' }, { tx });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: { action: 'logout', userId: 'u-2' } });
  });

  it('record propage l’échec : dans une transaction, l’opération doit être annulée', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(service.record('logout', {})).rejects.toThrow('base indisponible');
  });

  it('recordSafely ne fait jamais échouer l’action tracée, mais journalise l’échec', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.auditLog.create.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(service.recordSafely('password_changed', { actorId: 'u-1' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('password_changed'));
    error.mockRestore();
  });
});

describe('catalogue côté serveur', () => {
  it('isAuditAction reconnaît une action du catalogue', () => {
    expect(isAuditAction('bon_created')).toBe(true);
    expect(isAuditAction('toString')).toBe(false);
    expect(isAuditAction('action_inventee')).toBe(false);
  });

  it('auditSentence : phrase lisible d’une entrée, auteur et bon compris', () => {
    expect(
      auditSentence({
        action: 'bon_cancelled',
        actorName: 'Marie Martin',
        bonReference: 'BON-2026-0042',
        details: { previousStatus: 'active', reason: 'Doublon' },
      }),
    ).toMatch(/^Marie Martin .*BON-2026-0042.*\.$/);
  });

  it('auditSentence : sans auteur, « Le système » ; détails non textuels ignorés', () => {
    const sentence = auditSentence({ action: 'attachments_purged', details: { count: 3, ids: ['a'] } });
    expect(sentence.startsWith('Le système')).toBe(true);
    expect(sentence).not.toContain('[');
  });

  it('auditSentence : action inconnue (ancienne ligne) sans clé technique affichée', () => {
    expect(auditSentence({ action: 'vieille_action', actorName: 'Paul' })).toBe('Paul a effectué une action non répertoriée.');
  });
});
