import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { loadSignatureSignerNames, withSignerNames } from '../bon-signer-names';

function prismaWith(users: Array<{ email: string | null; displayName: string }>) {
  const findMany = vi.fn().mockResolvedValue(users);
  return { prisma: { user: { findMany } } as unknown as PrismaService, findMany };
}

describe('noms des signataires de la fiche IT', () => {
  it('une seule requête, adresses distinctes sans casse ni espaces, sans adresse vide', async () => {
    const { prisma, findMany } = prismaWith([{ email: 'Thomas.Girard@recette.test', displayName: 'Thomas Girard' }]);
    const names = await loadSignatureSignerNames(prisma, [
      { signerEmail: ' thomas.girard@recette.test ' },
      { signerEmail: 'THOMAS.GIRARD@recette.test' },
      { signerEmail: null },
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { email: { equals: 'thomas.girard@recette.test', mode: 'insensitive' } },
    ]);
    expect(names.get('thomas.girard@recette.test')).toBe('Thomas Girard');
  });

  it('aucune signature signée par un compte : aucune requête', async () => {
    const { prisma, findMany } = prismaWith([]);
    expect((await loadSignatureSignerNames(prisma, [{ signerEmail: null }])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('chaque signature porte le nom de son compte, ou null si l’adresse est inconnue', () => {
    const view = { id: 'b1', signatures: [{ signerEmail: 'THOMAS.girard@recette.test' }, { signerEmail: 'parti@x.test' }] };
    const named = withSignerNames(view, new Map([['thomas.girard@recette.test', 'Thomas Girard']]));
    expect(named.signatures.map((s) => s.signerName)).toEqual(['Thomas Girard', null]);
    expect(view.signatures[0]).not.toHaveProperty('signerName');
  });
});
