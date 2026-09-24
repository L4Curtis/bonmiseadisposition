/**
 * Mock factories for common services used throughout the backend tests.
 *
 * Each factory returns a fresh object so tests remain isolated from each other.
 * All methods are vi.fn() stubs with sensible defaults (resolved promises, etc.).
 */
import { vi } from 'vitest';
import { DEFAULT_CONFIGS } from '../../../pdf/pdf-template-config';

// ── NotificationService ──────────────────────────────────────────────────────

export function createMockNotificationService() {
  return {
    sendMiseDispositionRequest: vi.fn().mockResolvedValue(undefined),
    sendRestitutionRequest: vi.fn().mockResolvedValue(undefined),
    sendSignatureConfirmation: vi.fn().mockResolvedValue(undefined),
    sendPvClotureRequest: vi.fn().mockResolvedValue(undefined),
    sendContestationAlert: vi.fn().mockResolvedValue(undefined),
    sendContestationResolution: vi.fn().mockResolvedValue(undefined),
    sendCancellationNotice: vi.fn().mockResolvedValue(undefined),
    sendMarkFoundNotice: vi.fn().mockResolvedValue(undefined),
    sendUnilateralCloseNotice: vi.fn().mockResolvedValue(undefined),
    sendDailyReminders: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(true),
    invalidateTransporterCache: vi.fn(),
  };
}

// ── SignatureService ─────────────────────────────────────────────────────────

export function createMockSignatureService() {
  return {
    generateToken: vi.fn().mockResolvedValue({
      token: 'mock-token-uuid',
      id: 'sig-id',
    }),
    invalidateUnsignedTokens: vi.fn().mockResolvedValue(undefined),
    sign: vi.fn(),
    signItCachet: vi.fn(),
    getBonInfoByToken: vi.fn(),
    getSignatureImagesForBon: vi
      .fn()
      .mockResolvedValue({ it: null, collab: null }),
    getSignatureImageDecrypted: vi.fn().mockResolvedValue(null),
    saveItPvSignature: vi.fn().mockResolvedValue(undefined),
    verifyBonIntegrity: vi
      .fn()
      .mockResolvedValue({ allValid: true, signatures: [] }),
  };
}

// ── PdfService ───────────────────────────────────────────────────────────────

export function createMockPdfService() {
  return {
    generateAndSave: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
    generateBonPdf: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
  };
}

// ── SmbService ───────────────────────────────────────────────────────────────

export function createMockSmbService() {
  return {
    exportPdf: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi
      .fn()
      .mockResolvedValue({ success: true, message: 'ok' }),
    getStatus: vi.fn().mockResolvedValue({ enabled: false }),
    getFailedExports: vi.fn().mockResolvedValue([]),
    retryOne: vi.fn().mockResolvedValue({ success: true }),
    retryAllFailed: vi.fn().mockResolvedValue({ retried: 0, succeeded: 0, failed: 0 }),
    sanitizeName: vi.fn().mockImplementation((name: string) =>
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim(),
    ),
  };
}

// ── AppConfigService ─────────────────────────────────────────────────────────

export function createMockConfigService() {
  const store = new Map<string, string>();

  return {
    get: vi
      .fn()
      .mockImplementation((category: string, key: string) =>
        Promise.resolve(store.get(`${category}.${key}`) ?? null),
      ),
    set: vi
      .fn()
      .mockImplementation((category: string, key: string, value: string) => {
        store.set(`${category}.${key}`, value);
        return Promise.resolve();
      }),
    getAll: vi.fn().mockResolvedValue([]),
    invalidateCache: vi.fn(),
    isSetupRequired: vi.fn().mockResolvedValue(false),
    getInt: vi
      .fn()
      .mockImplementation(
        (
          category: string,
          key: string,
          options: { fallback: number; min: number; max?: number },
        ) => {
          const raw = store.get(`${category}.${key}`);
          const parsed = raw === undefined ? NaN : parseInt(raw, 10);
          if (!Number.isFinite(parsed)) return Promise.resolve(options.fallback);
          const clampedMin = Math.max(options.min, parsed);
          return Promise.resolve(
            options.max !== undefined ? Math.min(options.max, clampedMin) : clampedMin,
          );
        },
      ),
    getSignatureOverdueDays: vi.fn().mockResolvedValue(7),
  };
}

// ── EncryptionService ────────────────────────────────────────────────────────

export function createMockEncryptionService() {
  return {
    encrypt: vi
      .fn()
      .mockImplementation((data: string) => `encrypted:${data}`),
    decrypt: vi
      .fn()
      .mockImplementation((data: string) => data.replace('encrypted:', '')),
    seal: vi.fn().mockImplementation((data: string) => `seal:${data}`),
    verifySeal: vi
      .fn()
      .mockImplementation((data: string, expected: string) => expected === `seal:${data}`),
  };
}

// ── TimestampService (RFC 3161 — désactivé par défaut dans les tests) ──────────

export function createMockTimestampService() {
  return {
    timestamp: vi.fn().mockResolvedValue(null),
  };
}

// ── PdfTemplatesService ──────────────────────────────────────────────────────

export function createMockPdfTemplatesService() {
  const defaultConfig = DEFAULT_CONFIGS['mise_disposition'];

  return {
    getAll: vi.fn().mockResolvedValue([]),
    getTemplateById: vi.fn().mockReturnValue({
      id: 'mise_disposition',
      name: 'Bon de mise à disposition',
      description: 'Modèle PDF mise à disposition',
      documentType: 'mise_disposition',
      variables: [],
    }),
    getDefaultConfig: vi.fn().mockReturnValue(defaultConfig),
    getTemplateConfig: vi.fn().mockResolvedValue(defaultConfig),
    updateTemplate: vi.fn().mockResolvedValue(undefined),
    resetTemplate: vi.fn().mockResolvedValue(undefined),
    exportAll: vi.fn().mockResolvedValue({ exportedAt: '', templates: [] }),
    importAll: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
  };
}

// ── JobTrackerService (lot A5, supervision) ─────────────────────────────────
// Pass-through par défaut : exécute simplement `fn()` sans écrire en base, si
// bien que le comportement des tâches planifiées testées via ce mock reste
// strictement identique à avant le branchement du suivi (mêmes résolutions,
// mêmes rejets propagés à l'appelant).

export function createMockJobTrackerService() {
  return {
    track: vi.fn((_job: string, fn: () => Promise<unknown>) => fn()),
  };
}

// ── TemplatesService ─────────────────────────────────────────────────────────

export function createMockTemplatesService() {
  return {
    renderTemplate: vi
      .fn()
      .mockResolvedValue('<html>mock template</html>'),
    getAll: vi.fn().mockResolvedValue([]),
    getTemplateById: vi.fn(),
    getDefaultHtml: vi.fn().mockReturnValue('<html>default</html>'),
    getTemplateHtml: vi
      .fn()
      .mockResolvedValue('<html>template</html>'),
    render: vi
      .fn()
      .mockImplementation(
        (html: string, _vars: Record<string, string>) => html,
      ),
    getPreviewHtml: vi
      .fn()
      .mockResolvedValue('<html>preview</html>'),
    updateTemplate: vi.fn().mockResolvedValue(undefined),
    resetTemplate: vi.fn().mockResolvedValue(undefined),
    exportAll: vi.fn().mockResolvedValue({ exportedAt: '', templates: [] }),
    importAll: vi
      .fn()
      .mockResolvedValue({ imported: 0, skipped: 0 }),
  };
}
