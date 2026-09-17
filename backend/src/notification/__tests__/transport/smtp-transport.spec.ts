import * as nodemailer from 'nodemailer';
import {
  readSmtpSettings,
  readFromAddress,
  buildTransporterCacheKey,
  buildTransporter,
} from '../../transport/smtp-transport';
import { createMockConfigService } from '../../../common/__tests__/helpers/mock-services';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn() }),
}));

describe('smtp-transport', () => {
  describe('readSmtpSettings', () => {
    it('reads all five SMTP keys from the "smtp" category', async () => {
      const configService = createMockConfigService();
      configService.set('smtp', 'host', 'smtp.test.local');
      configService.set('smtp', 'port', '587');
      configService.set('smtp', 'user', 'user@test.local');
      configService.set('smtp', 'password', 'secret');
      configService.set('smtp', 'secure', 'true');

      const settings = await readSmtpSettings(configService as never);

      expect(settings).toEqual({
        host: 'smtp.test.local',
        port: '587',
        user: 'user@test.local',
        pass: 'secret',
        secure: 'true',
      });
    });

    it('returns null fields when nothing is configured', async () => {
      const configService = createMockConfigService();
      const settings = await readSmtpSettings(configService as never);
      expect(settings).toEqual({ host: null, port: null, user: null, pass: null, secure: null });
    });
  });

  describe('readFromAddress', () => {
    it('returns the configured smtp.from value', async () => {
      const configService = createMockConfigService();
      configService.set('smtp', 'from', 'noreply@test.local');
      expect(await readFromAddress(configService as never)).toBe('noreply@test.local');
    });

    it('returns an empty string (not undefined/null) when unconfigured', async () => {
      const configService = createMockConfigService();
      expect(await readFromAddress(configService as never)).toBe('');
    });
  });

  describe('buildTransporterCacheKey', () => {
    it('produces the same key for identical settings', () => {
      const settings = { host: 'h', port: '587', user: 'u', pass: 'p', secure: 'false' };
      expect(buildTransporterCacheKey(settings)).toBe(buildTransporterCacheKey({ ...settings }));
    });

    it('produces a different key when a single field changes', () => {
      const base = { host: 'h', port: '587', user: 'u', pass: 'p', secure: 'false' };
      const changed = { ...base, host: 'other-host' };
      expect(buildTransporterCacheKey(base)).not.toBe(buildTransporterCacheKey(changed));
    });
  });

  describe('buildTransporter', () => {
    beforeEach(() => jest.clearAllMocks());

    it('enables auth only when both user and password are present', () => {
      buildTransporter({ host: 'h', port: '587', user: 'u', pass: 'p', secure: 'false' });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: { user: 'u', pass: 'p' } }),
      );
    });

    it('disables auth when password is missing (avoids an AUTH attempt with an empty password)', () => {
      buildTransporter({ host: 'h', port: '587', user: 'u', pass: '', secure: 'false' });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: undefined }),
      );
    });

    it('defaults the port to 587 when unset', () => {
      buildTransporter({ host: 'h', port: null, user: null, pass: null, secure: null });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587 }));
    });

    it('parses a configured port and the "secure" flag', () => {
      buildTransporter({ host: 'h', port: '465', user: null, pass: null, secure: 'true' });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });
  });
});
