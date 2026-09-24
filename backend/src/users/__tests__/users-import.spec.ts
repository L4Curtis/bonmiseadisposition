import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { importManualUsers } from '../users-import';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

const ACTOR_ID = 'actor-001';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, Mock>>;

interface ExistingUserFixture {
  id: string;
  samAccountName: string;
  displayName: string;
  email: string | null;
  department: string | null;
  filialeId: string | null;
  active: boolean;
  isManualAccount: boolean;
}

function manual(overrides: Partial<ExistingUserFixture> = {}): ExistingUserFixture {
  return {
    id: 'm1',
    samAccountName: 'manuel.jean.dupont',
    displayName: 'Jean DUPONT',
    email: null,
    department: null,
    filialeId: null,
    active: true,
    isManualAccount: true,
    ...overrides,
  };
}

function directory(overrides: Partial<ExistingUserFixture> = {}): ExistingUserFixture {
  return manual({
    id: 'ad1',
    samAccountName: 'jdupont',
    displayName: 'Jean Dupont',
    email: 'jean.dupont@livio.fr',
    isManualAccount: false,
    ...overrides,
  });
}

describe('importManualUsers (POST /users/manual/import)', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.filiale.findMany.mockResolvedValue([
      { id: 'f1', name: 'Fresse GDO', active: true },
      { id: 'f2', name: 'Ancienne', active: false },
    ]);
    prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: `new-${String(data.samAccountName)}`, ...data }));
    prisma.user.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ ...manual({ id: where.id }), ...data }));
  });

  const run = (items: unknown[]) => importManualUsers(prisma as unknown as PrismaService, items, ACTOR_ID);

  it('crée un compte manuel non authentifiable avec la filiale désignée par son nom', async () => {
    const result = await run([
      { firstName: 'Jean', lastName: 'Dupont', email: ' Jean@Exemple.FR ', department: 'Chantier', filiale: 'fresse gdo' },
    ]);

    expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(result.lines[0]).toMatchObject({ index: 0, status: 'created', samAccountName: 'manuel.jean.dupont' });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        samAccountName: 'manuel.jean.dupont',
        displayName: 'Jean DUPONT',
        email: 'jean@exemple.fr',
        department: 'Chantier',
        filialeId: 'f1',
        role: 'collaborator',
        isManualAccount: true,
        isLocalAccount: false,
        passwordHash: null,
        active: true,
      }),
    }));
  });

  it('accepte une ligne sans email (principe de ces comptes)', async () => {
    const result = await run([{ firstName: 'Anne', lastName: 'Martin' }]);
    expect(result.created).toBe(1);
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: null, filialeId: null }),
    }));
  });

  it('rejette un email invalide sans interrompre le reste du lot', async () => {
    const result = await run([
      { firstName: 'Anne', lastName: 'Martin', email: 'pas-un-email' },
      { firstName: 'Paul', lastName: 'Durand' },
    ]);
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([{ index: 0, message: 'Email invalide.' }]);
  });

  it('rejette un email appartenant à un compte de l\'annuaire', async () => {
    prisma.user.findMany.mockResolvedValue([directory()]);
    const result = await run([{ firstName: 'Jean', lastName: 'Dupont', email: 'JEAN.DUPONT@livio.fr' }]);
    expect(result.created).toBe(0);
    expect(result.errors[0].message).toMatch(/compte de l'annuaire/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('ne modifie jamais un compte synchronisé depuis l\'annuaire', async () => {
    prisma.user.findMany.mockResolvedValue([directory()]);
    const result = await run([{ samAccountName: 'JDUPONT', firstName: 'Jean', lastName: 'Autre', active: false }]);
    expect(result.updated).toBe(0);
    expect(result.errors[0].message).toMatch(/annuaire/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('met à jour les seuls champs fournis et différents d\'un compte manuel', async () => {
    prisma.user.findMany.mockResolvedValue([manual({ department: 'Chantier', filialeId: 'f1' })]);
    const result = await run([
      { samAccountName: 'manuel.jean.dupont', firstName: 'Jean', lastName: 'Dupont', department: 'Atelier', active: false },
    ]);
    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'm1' },
      data: { department: 'Atelier', active: false },
    }));
  });

  it('ignore une ligne qui ne change rien', async () => {
    prisma.user.findMany.mockResolvedValue([manual()]);
    const result = await run([{ samAccountName: 'manuel.jean.dupont', firstName: 'Jean', lastName: 'Dupont' }]);
    expect(result).toMatchObject({ updated: 0, skipped: 1 });
    expect(result.lines[0].status).toBe('skipped');
  });

  it('refuse un identifiant inconnu plutôt que de créer sous cet identifiant', async () => {
    const result = await run([{ samAccountName: 'manuel.inconnu', firstName: 'Jean', lastName: 'Dupont' }]);
    expect(result.errors[0].message).toMatch(/inconnu/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuse de créer un homonyme d\'un compte manuel existant (import rejoué)', async () => {
    prisma.user.findMany.mockResolvedValue([manual()]);
    const result = await run([{ firstName: 'jean', lastName: 'dupont' }]);
    expect(result.created).toBe(0);
    expect(result.errors[0].message).toMatch(/manuel\.jean\.dupont/);
  });

  it('détecte les doublons à l\'intérieur du fichier (identifiant, email, nom sans identifiant)', async () => {
    prisma.user.findMany.mockResolvedValue([manual()]);
    const result = await run([
      { firstName: 'Anne', lastName: 'Martin', email: 'anne@exemple.fr' },
      { firstName: 'Paul', lastName: 'Durand', email: 'ANNE@exemple.fr' },
      { firstName: 'Zoé', lastName: 'Petit' },
      { firstName: 'Zoe', lastName: 'PETIT' },
      { samAccountName: 'manuel.jean.dupont', firstName: 'Jean', lastName: 'Dupont', department: 'A' },
      { samAccountName: 'MANUEL.JEAN.DUPONT', firstName: 'Jean', lastName: 'Dupont', department: 'B' },
    ]);
    expect(result.created).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.errors.map((e) => e.index)).toEqual([1, 3, 5]);
    expect(result.errors.every((e) => e.message.startsWith('Doublon dans le fichier'))).toBe(true);
  });

  it('rejette une filiale inconnue ou inactive', async () => {
    const result = await run([
      { firstName: 'Anne', lastName: 'Martin', filiale: 'Ancienne' },
      { firstName: 'Paul', lastName: 'Durand', filiale: 'Nulle part' },
    ]);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/introuvable ou inactive/);
  });

  it('ignore les lignes de commentaire du modèle', async () => {
    const result = await run([
      { samAccountName: '# Valeurs acceptées', firstName: 'obligatoire', lastName: 'obligatoire' },
      { samAccountName: '', firstName: '# Exemple', lastName: 'Dupont' },
    ]);
    expect(result).toMatchObject({ created: 0, skipped: 2, errors: [] });
  });

  it('suffixe l\'identifiant généré en cas de collision', async () => {
    prisma.user.findUnique.mockImplementation(({ where }: { where: { samAccountName: string } }) =>
      Promise.resolve(where.samAccountName === 'manuel.anne.martin' ? { id: 'x' } : null));
    const result = await run([{ firstName: 'Anne', lastName: 'Martin' }]);
    expect(result.lines[0].samAccountName).toBe('manuel.anne.martin-2');
  });

  it('transforme une violation d\'unicité concurrente en erreur de ligne', async () => {
    prisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );
    const result = await run([{ firstName: 'Anne', lastName: 'Martin', email: 'anne@exemple.fr' }]);
    expect(result.errors).toEqual([{ index: 0, message: 'Un utilisateur avec cet email existe déjà.' }]);
  });

  it('rejette une ligne qui n\'est pas un objet', async () => {
    const result = await run(['texte', null]);
    expect(result.errors.map((e) => e.index)).toEqual([0, 1]);
  });

  it('journalise un users_imported avec les seuls compteurs', async () => {
    await run([{ firstName: 'Anne', lastName: 'Martin' }, { firstName: '', lastName: 'X' }]);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: ACTOR_ID,
        action: 'users_imported',
        details: { created: 1, updated: 0, skipped: 0, errorCount: 1 },
      },
    });
  });
});
