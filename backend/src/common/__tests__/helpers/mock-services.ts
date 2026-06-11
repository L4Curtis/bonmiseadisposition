/**
 * Mock factories for common services used throughout the backend tests.
 *
 * Each factory returns a fresh object so tests remain isolated from each other.
 * All methods are jest.fn() stubs with sensible defaults (resolved promises, etc.).
 */

// ── NotificationService ──────────────────────────────────────────────────────

export function createMockNotificationService() {
  return {
    sendMiseDispositionRequest: jest.fn().mockResolvedValue(undefined),
    sendRestitutionRequest: jest.fn().mockResolvedValue(undefined),
    sendSignatureConfirmation: jest.fn().mockResolvedValue(undefined),
    sendPvClotureRequest: jest.fn().mockResolvedValue(undefined),
    sendContestationAlert: jest.fn().mockResolvedValue(undefined),
    sendContestationResolution: jest.fn().mockResolvedValue(undefined),
    sendCancellationNotice: jest.fn().mockResolvedValue(undefined),
    sendMarkFoundNotice: jest.fn().mockResolvedValue(undefined),
    sendUnilateralCloseNotice: jest.fn().mockResolvedValue(undefined),
    sendDailyReminders: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(true),
    invalidateTransporterCache: jest.fn(),
  };
}

// ── SignatureService ─────────────────────────────────────────────────────────

export function createMockSignatureService() {
  return {
    generateToken: jest.fn().mockResolvedValue({
      token: 'mock-token-uuid',
      id: 'sig-id',
    }),
    invalidateUnsignedTokens: jest.fn().mockResolvedValue(undefined),
    sign: jest.fn(),
    signItCachet: jest.fn(),
    getBonInfoByToken: jest.fn(),
    getSignatureImagesForBon: jest
      .fn()
      .mockResolvedValue({ it: null, collab: null }),
    getSignatureImageDecrypted: jest.fn().mockResolvedValue(null),
    saveItPvSignature: jest.fn().mockResolvedValue(undefined),
  };
}

// ── PdfService ───────────────────────────────────────────────────────────────

export function createMockPdfService() {
  return {
    generateAndSave: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
    generateBonPdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
  };
}

// ── SmbService ───────────────────────────────────────────────────────────────

export function createMockSmbService() {
  return {
    exportPdf: jest.fn().mockResolvedValue({ success: true }),
    testConnection: jest
      .fn()
      .mockResolvedValue({ success: true, message: 'ok' }),
    getStatus: jest.fn().mockResolvedValue({ enabled: false }),
    getFailedExports: jest.fn().mockResolvedValue([]),
    retryOne: jest.fn().mockResolvedValue({ success: true }),
    retryAllFailed: jest.fn().mockResolvedValue({ retried: 0, succeeded: 0, failed: 0 }),
    sanitizeName: jest.fn().mockImplementation((name: string) =>
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
    get: jest
      .fn()
      .mockImplementation((category: string, key: string) =>
        Promise.resolve(store.get(`${category}.${key}`) ?? null),
      ),
    set: jest
      .fn()
      .mockImplementation((category: string, key: string, value: string) => {
        store.set(`${category}.${key}`, value);
        return Promise.resolve();
      }),
    getAll: jest.fn().mockResolvedValue([]),
    invalidateCache: jest.fn(),
    isSetupRequired: jest.fn().mockResolvedValue(false),
  };
}

// ── EncryptionService ────────────────────────────────────────────────────────

export function createMockEncryptionService() {
  return {
    encrypt: jest
      .fn()
      .mockImplementation((data: string) => `encrypted:${data}`),
    decrypt: jest
      .fn()
      .mockImplementation((data: string) => data.replace('encrypted:', '')),
  };
}

// ── PdfTemplatesService ──────────────────────────────────────────────────────

export function createMockPdfTemplatesService() {
  // Lazy-import to avoid circular dependency at module load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DEFAULT_CONFIGS } = require('../../../pdf/pdf-template-config');
  const defaultConfig = DEFAULT_CONFIGS['mise_disposition'];

  return {
    getAll: jest.fn().mockResolvedValue([]),
    getTemplateById: jest.fn().mockReturnValue({
      id: 'mise_disposition',
      name: 'Bon de mise à disposition',
      description: 'Modèle PDF mise à disposition',
      documentType: 'mise_disposition',
      variables: [],
    }),
    getDefaultConfig: jest.fn().mockReturnValue(defaultConfig),
    getTemplateConfig: jest.fn().mockResolvedValue(defaultConfig),
    updateTemplate: jest.fn().mockResolvedValue(undefined),
    resetTemplate: jest.fn().mockResolvedValue(undefined),
    exportAll: jest.fn().mockResolvedValue({ exportedAt: '', templates: [] }),
    importAll: jest.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
  };
}

// ── TemplatesService ─────────────────────────────────────────────────────────

export function createMockTemplatesService() {
  return {
    renderTemplate: jest
      .fn()
      .mockResolvedValue('<html>mock template</html>'),
    getAll: jest.fn().mockResolvedValue([]),
    getTemplateById: jest.fn(),
    getDefaultHtml: jest.fn().mockReturnValue('<html>default</html>'),
    getTemplateHtml: jest
      .fn()
      .mockResolvedValue('<html>template</html>'),
    render: jest
      .fn()
      .mockImplementation(
        (html: string, _vars: Record<string, string>) => html,
      ),
    getPreviewHtml: jest
      .fn()
      .mockResolvedValue('<html>preview</html>'),
    updateTemplate: jest.fn().mockResolvedValue(undefined),
    resetTemplate: jest.fn().mockResolvedValue(undefined),
    exportAll: jest.fn().mockResolvedValue({ exportedAt: '', templates: [] }),
    importAll: jest
      .fn()
      .mockResolvedValue({ imported: 0, skipped: 0 }),
  };
}
