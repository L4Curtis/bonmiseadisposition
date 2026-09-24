import { Logger } from '@nestjs/common';
import { parseDelay, getTokenValidityDays, regenerateSignatureToken } from '../../reminders/daily-reminders';
import { createMockConfigService } from '../../../common/__tests__/helpers/mock-services';
import { createMockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

const asMock = (fn: unknown): Mock => fn as Mock;

describe('parseDelay', () => {
  it('returns the parsed value when it is a positive integer', () => {
    expect(parseDelay('5', 3)).toBe(5);
  });

  it('returns the fallback when raw is null', () => {
    expect(parseDelay(null, 3)).toBe(3);
  });

  it('returns the fallback when raw is not a number', () => {
    expect(parseDelay('abc', 3)).toBe(3);
  });

  it('returns the fallback when raw is zero or negative', () => {
    expect(parseDelay('0', 3)).toBe(3);
    expect(parseDelay('-2', 3)).toBe(3);
  });
});

describe('getTokenValidityDays', () => {
  it('defaults to 7 when unconfigured', async () => {
    const configService = createMockConfigService();
    expect(await getTokenValidityDays(configService as never)).toBe(7);
  });

  it('clamps below 1 up to 1', async () => {
    const configService = createMockConfigService();
    configService.set('tokens', 'expiry_days', '0');
    expect(await getTokenValidityDays(configService as never)).toBe(1);
  });

  it('clamps above 30 down to 30', async () => {
    const configService = createMockConfigService();
    configService.set('tokens', 'expiry_days', '90');
    expect(await getTokenValidityDays(configService as never)).toBe(30);
  });

  it('returns the configured value when within range', async () => {
    const configService = createMockConfigService();
    configService.set('tokens', 'expiry_days', '10');
    expect(await getTokenValidityDays(configService as never)).toBe(10);
  });
});

describe('regenerateSignatureToken', () => {
  it('invalidates the previous unsigned signature and creates a fresh token', async () => {
    const prisma = createMockPrismaService();
    const configService = createMockConfigService();
    const logger = { log: vi.fn() } as unknown as Logger;
    asMock(prisma.signature.updateMany).mockResolvedValue({ count: 1 });
    asMock(prisma.signature.create).mockResolvedValue({ token: 'fresh-token' });

    const result = await regenerateSignatureToken(
      prisma as never,
      configService as never,
      logger,
      'bon-1',
      'mise_disposition',
    );

    expect(prisma.signature.updateMany).toHaveBeenCalledWith({
      where: { bonId: 'bon-1', type: 'mise_disposition', signed: false },
      data: { tokenExpiresAt: new Date(0) },
    });
    expect(prisma.signature.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bonId: 'bon-1', type: 'mise_disposition', isInPerson: false }),
      }),
    );
    expect(result).toEqual({ token: 'fresh-token' });
  });
});
