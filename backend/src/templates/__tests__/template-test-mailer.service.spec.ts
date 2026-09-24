import { NotFoundException } from '@nestjs/common';
import { TemplateTestMailerService } from '../template-test-mailer.service';
import { TemplatesService } from '../templates.service';
import { NotificationService } from '../../notification/notification.service';
import { TemplateBonPreviewService } from '../template-bon-preview.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import type { Mock } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMock = (fn: unknown): Mock => fn as any;

describe('TemplateTestMailerService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let templatesService: { getTemplateById: Mock; getPreviewHtml: Mock };
  let notificationService: { sendEmail: Mock };
  let bonPreviewService: { render: Mock };
  let service: TemplateTestMailerService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    templatesService = {
      getTemplateById: vi.fn().mockReturnValue({ id: 'reminder', name: 'Rappel — Document en attente de signature' }),
      getPreviewHtml: vi.fn().mockResolvedValue('<html>apercu</html>'),
    };
    notificationService = { sendEmail: vi.fn() };
    bonPreviewService = {
      render: vi.fn().mockResolvedValue({
        html: '<html>bon reel</html>',
        subject: 'sujet',
        reference: 'BMD-2026-0007',
        sampleVariables: [],
      }),
    };
    service = new TemplateTestMailerService(
      templatesService as unknown as TemplatesService,
      notificationService as unknown as NotificationService,
      prisma as never,
      bonPreviewService as unknown as TemplateBonPreviewService,
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

  describe('avec un vrai bon (lot H3)', () => {
    const bonId = '11111111-2222-3333-4444-555555555555';

    it('rend le modèle avec les données du bon et le signale dans le sujet', async () => {
      notificationService.sendEmail.mockResolvedValue({ ok: true });

      await service.sendTest('reminder', 'admin@livio.fr', 'admin-1', bonId);

      expect(bonPreviewService.render).toHaveBeenCalledWith('reminder', bonId);
      expect(templatesService.getPreviewHtml).not.toHaveBeenCalled();
      expect(notificationService.sendEmail).toHaveBeenCalledWith(
        'admin@livio.fr',
        '[TEST] Rappel — Document en attente de signature — BMD-2026-0007',
        '<html>bon reel</html>',
      );
    });

    it("trace le bon utilisé dans l'audit, sans rattacher la ligne à l'historique du bon", async () => {
      notificationService.sendEmail.mockResolvedValue({ ok: true });

      await service.sendTest('reminder', 'admin@livio.fr', 'admin-1', bonId);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-1',
          action: 'email_template_test_sent',
          details: {
            templateId: 'reminder',
            email: 'admin@livio.fr',
            success: true,
            bonId,
            bonReference: 'BMD-2026-0007',
          },
        },
      });
    });

    it("n'envoie rien si le bon est introuvable", async () => {
      bonPreviewService.render.mockRejectedValue(new NotFoundException('Bon introuvable'));

      await expect(service.sendTest('reminder', 'admin@livio.fr', 'admin-1', bonId)).rejects.toThrow(NotFoundException);
      expect(notificationService.sendEmail).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
