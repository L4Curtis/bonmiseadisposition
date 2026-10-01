import * as nodemailer from 'nodemailer';
import {
  readSmtpSettings,
  readFromAddress,
  buildTransporterCacheKey,
  buildTransporter,
} from '../../transport/smtp-transport';
import { createMockConfigService } from '../../../common/__tests__/helpers/mock-services';
import { ConfigRegistryService } from '../../../config/config-registry.service';

/** Registre réel au-dessus du mock de la configuration brute. */
const registry = (config: ReturnType<typeof createMockConfigService>) => new ConfigRegistryService(config as never, {});

vi.mock('nodemailer', () => ({
  createTransport: vi.fn().mockReturnValue({ sendMail: vi.fn() }),
}));

describe('smtp-transport', () => {
  describe('readSmtpSettings', () => {
    it('lit les cinq réglages SMTP, typés par le registre', async () => {
      const configService = createMockConfigService();
      configService.set('smtp', 'host', 'smtp.test.local');
      configService.set('smtp', 'port', '587');
      configService.set('smtp', 'user', 'user@test.local');
      configService.set('smtp', 'password', 'secret');
      configService.set('smtp', 'secure', 'true');

      const settings = await readSmtpSettings(registry(configService));

      expect(settings).toEqual({
        host: 'smtp.test.local',
        port: 587,
        user: 'user@test.local',
        pass: 'secret',
        secure: true,
      });
    });

    it('applique les défauts du registre quand rien n’est saisi (port 587, sans TLS)', async () => {
      const configService = createMockConfigService();
      const settings = await readSmtpSettings(registry(configService));
      expect(settings).toEqual({ host: null, port: 587, user: null, pass: null, secure: false });
    });

    it('ramène un port hors bornes à la borne', async () => {
      const configService = createMockConfigService();
      configService.set('smtp', 'port', '99999');
      expect((await readSmtpSettings(registry(configService))).port).toBe(65535);
    });
  });

  describe('readFromAddress', () => {
    it('returns the configured smtp.from value', async () => {
      const configService = createMockConfigService();
      configService.set('smtp', 'from', 'noreply@test.local');
      expect(await readFromAddress(registry(configService))).toBe('noreply@test.local');
    });

    it('returns an empty string (not undefined/null) when unconfigured', async () => {
      const configService = createMockConfigService();
      expect(await readFromAddress(registry(configService))).toBe('');
    });
  });

  describe('buildTransporterCacheKey', () => {
    it('produces the same key for identical settings', () => {
      const settings = { host: 'h', port: 587, user: 'u', pass: 'p', secure: false };
      expect(buildTransporterCacheKey(settings)).toBe(buildTransporterCacheKey({ ...settings }));
    });

    it('produces a different key when a single field changes', () => {
      const base = { host: 'h', port: 587, user: 'u', pass: 'p', secure: false };
      const changed = { ...base, host: 'other-host' };
      expect(buildTransporterCacheKey(base)).not.toBe(buildTransporterCacheKey(changed));
    });
  });

  describe('buildTransporter', () => {
    beforeEach(() => vi.clearAllMocks());

    it('enables auth only when both user and password are present', () => {
      buildTransporter({ host: 'h', port: 587, user: 'u', pass: 'p', secure: false });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: { user: 'u', pass: 'p' } }),
      );
    });

    it('disables auth when password is missing (avoids an AUTH attempt with an empty password)', () => {
      buildTransporter({ host: 'h', port: 587, user: 'u', pass: '', secure: false });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: undefined }),
      );
    });

    it('transmet le port et le chiffrement TLS', () => {
      buildTransporter({ host: 'h', port: 465, user: null, pass: null, secure: true });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });
  });
});
