import { BadRequestException } from '@nestjs/common';
import { TemplatesController } from '../templates.controller';
import { TemplatesService } from '../../templates/templates.service';
import { TemplateTestMailerService } from '../../templates/template-test-mailer.service';
import { AuthUser } from '../../auth/auth-user.interface';
import type { Mock } from 'vitest';

const adminUser: AuthUser = {
  id: 'admin-1',
  samAccountName: 'admin.livio',
  displayName: 'Admin Livio',
  email: 'admin@livio.fr',
  department: null,
  company: null,
  title: null,
  filialeId: null,
  filiale: null,
  isItStaff: true,
  role: 'admin',
  isLocalAccount: false,
  mustChangePassword: false,
  active: true,
};

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let templatesService: { getTemplateById: Mock };
  let templateTestMailerService: { sendTest: Mock };

  beforeEach(() => {
    templatesService = { getTemplateById: vi.fn() };
    templateTestMailerService = {
      sendTest: vi.fn().mockResolvedValue({ success: true, message: 'Email de test envoyé à admin@livio.fr.' }),
    };
    controller = new TemplatesController(
      templatesService as unknown as TemplatesService,
      templateTestMailerService as unknown as TemplateTestMailerService,
    );
  });

  describe('sendTest', () => {
    it('delegates to TemplateTestMailerService with the trimmed email and current user id', async () => {
      const result = await controller.sendTest('reminder', { email: '  admin@livio.fr  ' }, adminUser);

      expect(templateTestMailerService.sendTest).toHaveBeenCalledWith('reminder', 'admin@livio.fr', 'admin-1');
      expect(result).toEqual({ success: true, message: 'Email de test envoyé à admin@livio.fr.' });
    });

    it('rejects a missing email', async () => {
      await expect(controller.sendTest('reminder', { email: '' }, adminUser)).rejects.toThrow(BadRequestException);
      expect(templateTestMailerService.sendTest).not.toHaveBeenCalled();
    });

    it('rejects a malformed email', async () => {
      await expect(controller.sendTest('reminder', { email: 'not-an-email' }, adminUser))
        .rejects.toThrow(BadRequestException);
      expect(templateTestMailerService.sendTest).not.toHaveBeenCalled();
    });
  });
});
