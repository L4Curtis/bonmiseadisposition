import { Logger } from '@nestjs/common';
import { getTokenValidityDays, regenerateSignatureToken } from '../../reminders/daily-reminders';
import { ConfigRegistryService } from '../../../config/config-registry.service';
import { createMockConfigService } from '../../../common/__tests__/helpers/mock-services';
import { createMockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

const asMock = (fn: unknown): Mock => fn as Mock;

/** Registre réel au-dessus du mock de la configuration brute. */
const registry = (config: ReturnType<typeof createMockConfigService>) => new ConfigRegistryService(config as never, {});

describe('getTokenValidityDays', () => {
  it('defaults to 7 when unconfigured', async () => {
    const configService = createMockConfigService();
    expect(await getTokenValidityDays(registry(configService))).toBe(7);
  });

  it('clamps below 1 up to 1', async () => {
    const configService = createMockConfigService();
    configService.set('tokens', 'expiry_days', '0');
    expect(await getTokenValidityDays(registry(configService))).toBe(1);
  });

  it('clamps above 30 down to 30', async () => {
    const configService = createMockConfigService();
    configService.set('tokens', 'expiry_days', '90');
    expect(await getTokenValidityDays(registry(configService))).toBe(30);
  });

  it('returns the configured value when within range', async () => {
    const configService = createMockConfigService();
    configService.set('tokens', 'expiry_days', '10');
    expect(await getTokenValidityDays(registry(configService))).toBe(10);
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
      registry(configService),
      logger,
      'bon-1',
      'mise_disposition',
    );

    expect(prisma.signature.updateMany).toHaveBeenCalledWith({
      where: { bonId: 'bon-1', type: 'mise_disposition', signed: false, invalidatedAt: null, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0), invalidatedAt: expect.any(Date), invalidatedReason: 'replaced' },
    });
    expect(prisma.signature.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bonId: 'bon-1', type: 'mise_disposition', isInPerson: false }),
      }),
    );
    expect(result).toEqual({ token: 'fresh-token' });
  });
});
