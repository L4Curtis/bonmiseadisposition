import 'reflect-metadata';
import { importFilialeItems } from '../filiales-import';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(true) }));
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
// filiales-image.ts nomme ses fichiers via crypto.randomUUID() (le paquet
// uuid a été retiré du projet — voir chore(deps) « retirer uuid au profit de
// crypto.randomUUID »). Ce mock ciblait encore l'ancien paquet ; il n'avait
// plus aucun effet sur le nom réellement généré.
jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomUUID: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsp = require('fs/promises') as { writeFile: jest.Mock; unlink: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { randomUUID } = require('node:crypto') as { randomUUID: jest.Mock };

const USER_ID = 'user-001';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function pngBase64(size = 50): string {
  return Buffer.concat([PNG_MAGIC, Buffer.alloc(size, 1)]).toString('base64');
}
function jpegBase64(size = 50): string {
  return Buffer.concat([JPEG_MAGIC, Buffer.alloc(size, 1)]).toString('base64');
}
function gifBase64(): string {
  return Buffer.from('GIF89a-not-a-supported-format').toString('base64');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = Record<string, Record<string, jest.Mock<any, any>>>;

describe('importFilialeItems (POST /filiales/import)', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrismaService() as unknown as MockPrisma;
    let counter = 0;
    randomUUID.mockReset();
    randomUUID.mockImplementation(() => `uuid-${++counter}`);
    fsp.writeFile.mockClear();
    fsp.unlink.mockClear();
  });

  it('creates a brand-new filiale with all provided fields', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);
    prisma.filiale.create.mockResolvedValue({
      id: 'f-new', name: 'Livio Nord', displayName: 'Livio Nord (agence)',
      address: '1 rue de Lille', siret: '12345678900012', active: true, logoPath: null, stampPath: null,
    });

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Nord', displayName: 'Livio Nord (agence)', address: '1 rue de Lille', siret: '12345678900012', active: true }],
      USER_ID,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(prisma.filiale.create).toHaveBeenCalledWith({
      data: {
        name: 'Livio Nord',
        displayName: 'Livio Nord (agence)',
        address: '1 rue de Lille',
        siret: '12345678900012',
        active: true,
        logoPath: undefined,
        stampPath: undefined,
      },
    });
  });

  it('defaults displayName to name when omitted on creation', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);
    prisma.filiale.create.mockResolvedValue({ id: 'f-new', name: 'Livio Sud', displayName: 'Livio Sud', active: true });

    await importFilialeItems(prisma as unknown as PrismaService, [{ name: 'Livio Sud' }], USER_ID);

    expect(prisma.filiale.create).toHaveBeenCalledWith({
      data: {
        name: 'Livio Sud', displayName: 'Livio Sud', address: undefined, siret: undefined,
        active: true, logoPath: undefined, stampPath: undefined,
      },
    });
  });

  it('updates only the fields provided, matching the existing filiale case-insensitively', async () => {
    prisma.filiale.findMany.mockResolvedValue([
      {
        id: 'f-001', name: 'Livio Nord', displayName: 'Livio Nord', address: 'Ancienne adresse',
        siret: null, active: true, logoPath: null, stampPath: null,
      },
    ]);
    prisma.filiale.update.mockResolvedValue({ id: 'f-001' });

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'LIVIO NORD', address: 'Nouvelle adresse' }],
      USER_ID,
    );

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, errors: [] });
    expect(prisma.filiale.update).toHaveBeenCalledWith({
      where: { id: 'f-001' },
      data: { address: 'Nouvelle adresse' },
    });
    expect(prisma.filiale.create).not.toHaveBeenCalled();
  });

  it('skips a row that matches an existing filiale with no actual change', async () => {
    prisma.filiale.findMany.mockResolvedValue([
      {
        id: 'f-001', name: 'Livio Nord', displayName: 'Livio Nord', address: 'Adresse',
        siret: '12345678900012', active: true, logoPath: null, stampPath: null,
      },
    ]);

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Nord', displayName: 'Livio Nord', address: 'Adresse', siret: '12345678900012', active: true }],
      USER_ID,
    );

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1, errors: [] });
    expect(prisma.filiale.update).not.toHaveBeenCalled();
    expect(prisma.filiale.create).not.toHaveBeenCalled();
  });

  it('collects an error for an empty name without interrupting the rest of the batch', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);
    prisma.filiale.create.mockResolvedValue({ id: 'f-new', name: 'Livio Est', displayName: 'Livio Est', active: true });

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: '   ' }, { name: 'Livio Est' }],
      USER_ID,
    );

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(0);
    expect(prisma.filiale.create).toHaveBeenCalledTimes(1);
  });

  it('fails only its own row on invalid base64 content (decodes to nothing usable)', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);
    prisma.filiale.create.mockResolvedValue({ id: 'f-new', name: 'Livio Est', displayName: 'Livio Est', active: true });

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Bad', logoBase64: '!!!!' }, { name: 'Livio Est' }],
      USER_ID,
    );

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(0);
    expect(result.errors[0].message).toContain('base64 invalide');
    expect(prisma.filiale.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an image over 2 MB decoded, without creating the row', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);

    const oversized = Buffer.concat([PNG_MAGIC, Buffer.alloc(2 * 1024 * 1024 + 1, 1)]).toString('base64');

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Trop Gros', logoBase64: oversized }],
      USER_ID,
    );

    expect(result).toEqual({ created: 0, updated: 0, skipped: 0, errors: [{ index: 0, message: expect.stringContaining('2 Mo') }] });
    expect(prisma.filiale.create).not.toHaveBeenCalled();
    expect(fsp.writeFile).not.toHaveBeenCalled();
  });

  it('rejects a disallowed image type (real bytes, but neither PNG nor JPEG)', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Gif', logoBase64: gifBase64() }],
      USER_ID,
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('non supporté');
    expect(prisma.filiale.create).not.toHaveBeenCalled();
  });

  it('accepts a data-URL-prefixed PNG image and writes the decoded bytes under an app-generated filename', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);
    prisma.filiale.create.mockResolvedValue({ id: 'f-new', name: 'Livio Ouest', displayName: 'Livio Ouest', active: true });

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Ouest', logoBase64: `data:image/png;base64,${pngBase64()}` }],
      USER_ID,
    );

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(fsp.writeFile).toHaveBeenCalledTimes(1);
    const createCall = prisma.filiale.create.mock.calls[0][0].data;
    expect(createCall.logoPath).toBe('uploads/uuid-1.png');
    // Le nom de fichier vient de randomUUID(), jamais d'un nom fourni par l'appelant
    expect(createCall.logoPath).not.toContain('data:');
  });

  it('accepts a raw (non-data-URL) base64 JPEG for stampBase64', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);
    prisma.filiale.create.mockResolvedValue({ id: 'f-new', name: 'Livio Cachet', displayName: 'Livio Cachet', active: true });

    const result = await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Cachet', stampBase64: jpegBase64() }],
      USER_ID,
    );

    expect(result.created).toBe(1);
    const createCall = prisma.filiale.create.mock.calls[0][0].data;
    expect(createCall.stampPath).toBe('uploads/uuid-1.jpg');
  });

  it('deletes the previously-stored logo file when a row replaces it on update', async () => {
    prisma.filiale.findMany.mockResolvedValue([
      {
        id: 'f-001', name: 'Livio Nord', displayName: 'Livio Nord', address: null,
        siret: null, active: true, logoPath: 'uploads/old-logo.png', stampPath: null,
      },
    ]);
    prisma.filiale.update.mockResolvedValue({ id: 'f-001' });

    await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Nord', logoBase64: pngBase64() }],
      USER_ID,
    );

    expect(prisma.filiale.update).toHaveBeenCalledWith({
      where: { id: 'f-001' },
      data: { logoPath: 'uploads/uuid-1.png' },
    });
    expect(fsp.unlink).toHaveBeenCalledTimes(1);
  });

  it('always writes a filiales_imported audit entry with the final counters', async () => {
    prisma.filiale.findMany.mockResolvedValue([]);
    prisma.filiale.create.mockResolvedValue({ id: 'f-new', name: 'Livio Est', displayName: 'Livio Est', active: true });

    await importFilialeItems(
      prisma as unknown as PrismaService,
      [{ name: 'Livio Est' }, { name: '' }],
      USER_ID,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        action: 'filiales_imported',
        details: { created: 1, updated: 0, skipped: 0, errorCount: 1 },
      },
    });
  });
});
