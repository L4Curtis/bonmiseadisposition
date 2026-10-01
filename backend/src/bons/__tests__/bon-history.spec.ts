import { NotFoundException } from '@nestjs/common';
import { createMockPrismaService, type MockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { HISTORY_HIDDEN_ACTIONS, HISTORY_MAX_ENTRIES, loadBonHistory } from '../bon-history';

/** Historique des actions sur la fiche d'un bon (R-171). */

const BON = { id: 'bon-1', reference: 'BON-2026-0042' };

function row(id: string, action: string, at: string, extra: Record<string, unknown> = {}) {
  return { id, action, createdAt: new Date(at), details: null, userEmail: null, user: null, ...extra };
}

describe('loadBonHistory', () => {
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    prisma.bon.findUnique.mockResolvedValue(BON);
    prisma.user.findMany.mockResolvedValue([]);
  });

  /** Les lignes sont lues du plus récent au plus ancien (comme la base les rend). */
  function stored(rows: ReturnType<typeof row>[]) {
    prisma.auditLog.findMany.mockResolvedValue(rows);
    prisma.auditLog.count.mockResolvedValue(rows.length);
  }

  it('raconte chaque action avec la phrase du catalogue, du plus ancien au plus récent', async () => {
    stored([
      row('a3', 'bon_cancelled', '2026-09-03T10:00:00Z', {
        user: { displayName: 'Thomas Girard', email: 'thomas@livio.fr' },
        details: { previousStatus: 'sent_mise_dispo', reason: 'Doublon' },
      }),
      row('a2', 'signed_it_cachet', '2026-09-02T10:00:00Z', { userEmail: 'julie@livio.fr' }),
      row('a1', 'bon_created', '2026-09-01T10:00:00Z', { user: { displayName: 'Julie Moreau', email: 'julie@livio.fr' } }),
    ]);
    prisma.user.findMany.mockResolvedValue([{ email: 'julie@livio.fr', displayName: 'Julie Moreau' }]);

    const history = await loadBonHistory(prisma as never, 'bon-1');

    expect(history).toMatchObject({ total: 3, page: 1, limit: 3, truncated: false });
    expect(history.items.map((e) => e.sentence)).toEqual([
      'Julie Moreau a créé le bon BON-2026-0042.',
      'Julie Moreau a apposé la signature IT sur le bon BON-2026-0042.',
      'Thomas Girard a annulé le bon BON-2026-0042 (motif : Doublon).',
    ]);
    expect(history.items[2]).toEqual({
      id: 'a3',
      at: '2026-09-03T10:00:00.000Z',
      action: 'bon_cancelled',
      label: 'Bon annulé',
      tone: 'failure',
      sentence: 'Thomas Girard a annulé le bon BON-2026-0042 (motif : Doublon).',
      actorName: 'Thomas Girard',
    });
  });

  it('ne renvoie ni adresse IP, ni navigateur, ni le contenu brut de l’entrée', async () => {
    stored([row('a1', 'bon_contested', '2026-09-01T10:00:00Z', { details: { message: 'Texte libre du collaborateur' } })]);
    const [entry] = (await loadBonHistory(prisma as never, 'bon-1')).items;
    expect(Object.keys(entry).sort()).toEqual(['action', 'actorName', 'at', 'id', 'label', 'sentence', 'tone']);
    expect(JSON.stringify(entry)).not.toContain('Texte libre');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ ipAddress: true, userAgent: true }),
    }));
  });

  it('auteur connu par son seul email : son nom de compte, sinon l’email ; tâche planifiée : « Le système »', async () => {
    stored([
      row('a2', 'reminder_sent', '2026-09-02T10:00:00Z'),
      row('a1', 'signed_mise_disposition', '2026-09-01T10:00:00Z', { userEmail: 'inconnu@ext.fr' }),
    ]);
    const { items } = await loadBonHistory(prisma as never, 'bon-1');
    expect(items[0]).toMatchObject({ actorName: 'inconnu@ext.fr', sentence: 'inconnu@ext.fr a signé la mise à disposition du bon BON-2026-0042.' });
    expect(items[1]).toMatchObject({ actorName: null, sentence: 'Le système a renvoyé le lien de signature du bon BON-2026-0042.' });
  });

  it('action absente du catalogue : libellé neutre, sans code brut dans la phrase', async () => {
    stored([row('a1', 'ancienne_action', '2026-09-01T10:00:00Z')]);
    const [entry] = (await loadBonHistory(prisma as never, 'bon-1')).items;
    expect(entry).toMatchObject({ label: 'Action non répertoriée', tone: 'technical' });
    expect(entry.sentence).not.toContain('ancienne_action');
  });

  it('écarte les enregistrements de documents (déjà listés dans « Documents »)', async () => {
    stored([]);
    await loadBonHistory(prisma as never, 'bon-1');
    expect(HISTORY_HIDDEN_ACTIONS).toContain('pdf_snapshot_saved');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bonId: 'bon-1', action: { notIn: ['pdf_snapshot_saved'] } },
    }));
  });

  it('au-delà du plafond : les actions les plus récentes, signalées coupées', async () => {
    prisma.auditLog.findMany.mockResolvedValue([row('a9', 'bon_sent', '2026-09-09T10:00:00Z')]);
    prisma.auditLog.count.mockResolvedValue(HISTORY_MAX_ENTRIES + 5);
    const history = await loadBonHistory(prisma as never, 'bon-1');
    expect(history).toMatchObject({ truncated: true, total: HISTORY_MAX_ENTRIES + 5, limit: HISTORY_MAX_ENTRIES });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_MAX_ENTRIES,
    }));
  });

  it('bon inconnu : 404', async () => {
    prisma.bon.findUnique.mockResolvedValue(null);
    await expect(loadBonHistory(prisma as never, 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
  });
});
