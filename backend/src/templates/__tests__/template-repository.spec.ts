import {
  getCustomizedTemplates,
  getCustomTemplateHtml,
  saveTemplateHtml,
  deleteCustomTemplate,
  importTemplatesTransaction,
} from '../template-repository';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import { createMockConfigService } from '../../common/__tests__/helpers/mock-services';
import type { Mock } from 'vitest';

const asMock = (fn: unknown): Mock => fn as Mock;

describe('getCustomizedTemplates', () => {
  it('delegates to configService.getAll("email_templates")', async () => {
    const configService = createMockConfigService();
    await getCustomizedTemplates(configService as never);
    expect(configService.getAll).toHaveBeenCalledWith('email_templates');
  });
});

describe('getCustomTemplateHtml', () => {
  it('returns the configured HTML for the given id', async () => {
    const configService = createMockConfigService();
    configService.set('email_templates', 'reminder', '<html>custom</html>');
    expect(await getCustomTemplateHtml(configService as never, 'reminder')).toBe('<html>custom</html>');
  });

  it('returns null when nothing is customized', async () => {
    const configService = createMockConfigService();
    expect(await getCustomTemplateHtml(configService as never, 'reminder')).toBeNull();
  });
});

describe('saveTemplateHtml', () => {
  it('persists via configService.set with the updatedById option', async () => {
    const configService = createMockConfigService();
    await saveTemplateHtml(configService as never, 'reminder', '<html>x</html>', 'admin-1');
    expect(configService.set).toHaveBeenCalledWith('email_templates', 'reminder', '<html>x</html>', {
      updatedById: 'admin-1',
    });
  });
});

describe('deleteCustomTemplate', () => {
  it('deletes the AppConfig row and invalidates the cache', async () => {
    const prisma = createMockPrismaService();
    const configService = createMockConfigService();
    asMock(prisma.appConfig.deleteMany).mockResolvedValue({ count: 1 });

    await deleteCustomTemplate(prisma as never, configService as never, 'reminder');

    expect(prisma.appConfig.deleteMany).toHaveBeenCalledWith({
      where: { category: 'email_templates', key: 'reminder' },
    });
    expect(configService.invalidateCache).toHaveBeenCalledWith('email_templates', 'reminder');
  });
});

describe('importTemplatesTransaction', () => {
  it('does nothing when there are no items to import', async () => {
    const prisma = createMockPrismaService();
    const configService = createMockConfigService();

    await importTemplatesTransaction(prisma as never, configService as never, []);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(configService.invalidateCache).not.toHaveBeenCalled();
  });

  it('upserts each item in a single transaction and invalidates its cache', async () => {
    const prisma = createMockPrismaService();
    const configService = createMockConfigService();
    asMock(prisma.appConfig.upsert).mockResolvedValue({});

    await importTemplatesTransaction(
      prisma as never,
      configService as never,
      [{ id: 'reminder', html: '<html>a</html>' }, { id: 'contestation_alert', html: '<html>b</html>' }],
      'admin-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.appConfig.upsert).toHaveBeenCalledTimes(2);
    expect(configService.invalidateCache).toHaveBeenCalledWith('email_templates', 'reminder');
    expect(configService.invalidateCache).toHaveBeenCalledWith('email_templates', 'contestation_alert');
  });
});
