import { PrismaService } from '../../../prisma/prisma.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Recursively turns every function in T into jest.Mock<any, any[]>, and every
 * nested plain-object into a deeply-mocked version. Using `any` for return /
 * param types is intentional: Prisma delegates have complex conditional types
 * that are impossible to satisfy with fixture data. The trade-off (less strict
 * mockResolvedValue args) is standard practice for Prisma test mocks.
 */
type DeepMocked<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? jest.Mock<any, any[]>
    : T[K] extends object
      ? DeepMocked<T[K]>
      : T[K];
};

/**
 * The type returned by createMockPrismaService().
 * Re-export so tests can reference it via `ReturnType<typeof createMockPrismaService>`.
 */
export type MockPrismaService = DeepMocked<PrismaService>;

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Creates a fully mocked PrismaService with all Prisma model delegates
 * and utility methods ($transaction, $executeRaw) stubbed via jest.fn().
 *
 * Usage:
 *   const prisma = createMockPrismaService();
 *   prisma.bon.findUnique.mockResolvedValue(someBon);
 */
export function createMockPrismaService(): MockPrismaService {
  const mockPrisma = {
    // ── Bon ────────────────────────────────────────────────────────────────────
    bon: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },

    // ── User ───────────────────────────────────────────────────────────────────
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },

    // ── BonEquipment ───────────────────────────────────────────────────────────
    bonEquipment: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },

    // ── Signature ──────────────────────────────────────────────────────────────
    signature: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },

    // ── Contestation ───────────────────────────────────────────────────────────
    contestation: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },

    // ── AuditLog ───────────────────────────────────────────────────────────────
    auditLog: {
      // Resolved par défaut : certains appelants chaînent .catch() (non-bloquant)
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      count: jest.fn(),
    },

    // ── NotificationLog ────────────────────────────────────────────────────────
    notificationLog: {
      create: jest.fn(),
    },

    // ── PdfSnapshot ────────────────────────────────────────────────────────────
    pdfSnapshot: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },

    // ── ProofArchive (append-only) ───────────────────────────────────────────────
    proofArchive: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn(),
    },

    // ── Attachment (pièces jointes) ──────────────────────────────────────────────
    attachment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },

    // ── SmbExport ──────────────────────────────────────────────────────────────
    smbExport: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn(),
    },

    // ── AppConfig ──────────────────────────────────────────────────────────────
    appConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },

    // ── Filiale ────────────────────────────────────────────────────────────────
    filiale: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },

    // ── EquipmentCatalog ───────────────────────────────────────────────────────
    equipmentCatalog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },

    // ── EquipmentPack ──────────────────────────────────────────────────────────
    equipmentPack: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },

    // ── EquipmentPackItem ──────────────────────────────────────────────────────
    equipmentPackItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },

    // ── RevokedToken ───────────────────────────────────────────────────────────
    revokedToken: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },

    // ── Prisma Client utilities ────────────────────────────────────────────────
    $transaction: jest.fn().mockImplementation(
      (cbOrArray: ((tx: typeof mockPrisma) => Promise<unknown>) | Promise<unknown>[]) => {
        if (typeof cbOrArray === 'function') {
          return cbOrArray(mockPrisma);
        }
        return Promise.all(cbOrArray);
      },
    ),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ max: null }]),
  } as unknown as MockPrismaService;

  return mockPrisma;
}
