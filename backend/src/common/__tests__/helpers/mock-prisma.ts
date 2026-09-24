import { PrismaService } from '../../../prisma/prisma.service';
import { vi, type Mock } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Recursively turns every function in T into Mock, and every
 * nested plain-object into a deeply-mocked version. Using `any` for return /
 * param types is intentional: Prisma delegates have complex conditional types
 * that are impossible to satisfy with fixture data. The trade-off (less strict
 * mockResolvedValue args) is standard practice for Prisma test mocks.
 */
type DeepMocked<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? Mock
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
 * and utility methods ($transaction, $executeRaw) stubbed via vi.fn().
 *
 * Usage:
 *   const prisma = createMockPrismaService();
 *   prisma.bon.findUnique.mockResolvedValue(someBon);
 */
export function createMockPrismaService(): MockPrismaService {
  const mockPrisma = {
    // ── Bon ────────────────────────────────────────────────────────────────────
    bon: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },

    // ── User ───────────────────────────────────────────────────────────────────
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },

    // ── BonEquipment ───────────────────────────────────────────────────────────
    bonEquipment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },

    // ── Signature ──────────────────────────────────────────────────────────────
    signature: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },

    // ── Contestation ───────────────────────────────────────────────────────────
    contestation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },

    // ── AuditLog ───────────────────────────────────────────────────────────────
    auditLog: {
      // Resolved par défaut : certains appelants chaînent .catch() (non-bloquant)
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
      // Resolved par défaut (tableau vide) : departure-notifications.ts (lot D1)
      // lit tout l'historique `departure_notified` à chaque appel — un défaut
      // non mocké ne doit pas faire planter les appelants qui ne le testent pas.
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
    },

    // ── NotificationLog ────────────────────────────────────────────────────────
    notificationLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },

    // ── PdfSnapshot ────────────────────────────────────────────────────────────
    pdfSnapshot: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },

    // ── ProofArchive (append-only) ───────────────────────────────────────────────
    proofArchive: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn(),
    },

    // ── Attachment (pièces jointes) ──────────────────────────────────────────────
    attachment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },

    // ── SmbExport ──────────────────────────────────────────────────────────────
    smbExport: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn(),
    },

    // ── AppConfig ──────────────────────────────────────────────────────────────
    appConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },

    // ── Filiale ────────────────────────────────────────────────────────────────
    filiale: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },

    // ── EquipmentCatalog ───────────────────────────────────────────────────────
    equipmentCatalog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },

    // ── EquipmentPack ──────────────────────────────────────────────────────────
    equipmentPack: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },

    // ── EquipmentPackItem ──────────────────────────────────────────────────────
    equipmentPackItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },

    // ── RevokedToken ───────────────────────────────────────────────────────────
    revokedToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },

    // ── ScheduledJobRun (suivi des tâches planifiées — lot A5) ──────────────────
    scheduledJobRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },

    // ── Prisma Client utilities ────────────────────────────────────────────────
    $transaction: vi.fn().mockImplementation(
      (cbOrArray: ((tx: typeof mockPrisma) => Promise<unknown>) | Promise<unknown>[]) => {
        if (typeof cbOrArray === 'function') {
          return cbOrArray(mockPrisma);
        }
        return Promise.all(cbOrArray);
      },
    ),
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ max: null }]),
  } as unknown as MockPrismaService;

  return mockPrisma;
}
