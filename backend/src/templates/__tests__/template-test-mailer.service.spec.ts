import { NotFoundException } from '@nestjs/common';
import { TemplateTestMailerService } from '../template-test-mailer.service';
import { TemplatesService } from '../templates.service';
import { NotificationService } from '../../notification/notification.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMock = (fn: unknown): jest.Mock => fn as any;

describe('TemplateTestMailerService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let templatesService: { getTemplateById: jest.Mock; getPreviewHtml: jest.Mock };
  let notificationService: { sendEmail: jest.Mock };
  let service: TemplateTestMailerService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    templatesService = {
      getTemplateById: jest.fn().mockReturnValue({ id: 'reminder', name: 'Rappel — Document en attente de signature' }),
      getPreviewHtml: jest.fn().mockResolvedValue('<html>apercu</html>'),
    };
    notificationService = { sendEmail: jest.fn() };
    service = new TemplateTestMailerService(
      templatesService as unknown as TemplatesService,
      notificationService as unknown as NotificationService,
      prisma as never,
    );
  });

  it('sends the preview HTML to the given address and reports success', async () => {
    notificationService.sendEmail.mockResolvedValue({ ok: true });

    const result = await service.sendTest('reminder', 'admin@livio.fr', 'admin-1');

    expect(templatesService.getPreviewHtml).toHaveBeenCalledWith('reminder');
    expect(notificationService.sendEmail).toHaveBeenCalledWith(
      'admin@livio.fr',
      expect.stringContaining('Rappel'),
      '<html>apercu</html>',
    );
    expect(result).toEqual({ success: true, message: expect.stringContaining('admin@livio.fr') });
  });

  it('records the action in the audit log on success', async () => {
    notificationService.sendEmail.mockResolvedValue({ ok: true });

    await service.sendTest('reminder', 'admin@livio.fr', 'admin-1');

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'email_template_test_sent',
        details: { templateId: 'reminder', email: 'admin@livio.fr', success: true },
      },
    });
  });

  it('surfaces an explicit message when SMTP is not configured', async () => {
    notificationService.sendEmail.mockResolvedValue({ ok: false, error: 'SMTP non configuré' });

    const result = await service.sendTest('reminder', 'admin@livio.fr');

    expect(result).toEqual({ success: false, message: 'SMTP non configuré' });
  });

  it('records the failed attempt in the audit log too', async () => {
    notificationService.sendEmail.mockResolvedValue({ ok: false, error: 'SMTP non configuré' });

    await service.sendTest('reminder', 'admin@livio.fr');

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: undefined,
        action: 'email_template_test_sent',
        details: { templateId: 'reminder', email: 'admin@livio.fr', success: false },
      },
    });
  });

  it('propagates NotFoundException for an unknown template id', async () => {
    asMock(templatesService.getTemplateById).mockImplementation(() => {
      throw new NotFoundException('Template "does_not_exist" introuvable');
    });

    await expect(service.sendTest('does_not_exist', 'admin@livio.fr')).rejects.toThrow(NotFoundException);
    expect(notificationService.sendEmail).not.toHaveBeenCalled();
  });
});
