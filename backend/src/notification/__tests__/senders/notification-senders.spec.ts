import { Logger } from '@nestjs/common';
import {
  sendTemplatedNotification,
  sendTokenSignatureRequest,
  sendPrebuiltNotice,
} from '../../senders/notification-senders';
import { createMockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import { createMockTemplatesService } from '../../../common/__tests__/helpers/mock-services';
import { NotificationBon } from '../../../common/types';

const asMock = (fn: unknown): jest.Mock => fn as jest.Mock;

function makeDeps() {
  const prisma = createMockPrismaService();
  const templatesService = createMockTemplatesService();
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as Logger;
  const sendEmail = jest.fn().mockResolvedValue({ ok: true });
  asMock(prisma.notificationLog.create).mockResolvedValue({});
  return { prisma, templatesService, logger, sendEmail };
}

const baseBon: NotificationBon = {
  id: 'bon-1',
  reference: 'BON-2026-0001',
  civilite: 'mr',
  collaborateurEmail: 'jean.dupont@exemple.fr',
};

describe('sendTemplatedNotification', () => {
  it('renders, sends and logs "sent" when the recipient email is present (cas nominal)', async () => {
    const deps = makeDeps();

    await sendTemplatedNotification(deps as never, {
      bonId: 'bon-1',
      recipientEmail: 'jean.dupont@exemple.fr',
      type: 'confirmation',
      templateId: 'confirmation_mise_disposition',
      vars: { REFERENCE: 'BON-2026-0001' },
      subject: 'Confirmation',
    });

    expect(deps.templatesService.renderTemplate).toHaveBeenCalledWith('confirmation_mise_disposition', {
      REFERENCE: 'BON-2026-0001',
    });
    expect(deps.sendEmail).toHaveBeenCalledWith('jean.dupont@exemple.fr', 'Confirmation', expect.any(String));
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }),
    );
  });

  it('blocks the send and logs an explicit failure when the recipient email is missing (cas limite)', async () => {
    const deps = makeDeps();

    await sendTemplatedNotification(deps as never, {
      bonId: 'bon-1',
      recipientEmail: null,
      type: 'confirmation',
      templateId: 'confirmation_mise_disposition',
      vars: {},
      subject: 'Confirmation',
    });

    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed', recipientEmail: '' }) }),
    );
  });
});

describe('sendTokenSignatureRequest', () => {
  it('builds the signer URL from the app URL and token, then sends (cas nominal)', async () => {
    const deps = { ...makeDeps(), getAppUrl: jest.fn().mockResolvedValue('https://app.test.local') };
    const buildMessage = jest.fn().mockReturnValue({ vars: { SIGNER_URL: 'x' }, subject: 'Signer' });

    await sendTokenSignatureRequest(deps as never, {
      bon: baseBon,
      token: 'token-abc',
      type: 'mise_dispo_request',
      templateId: 'mise_disposition_request',
      buildMessage,
    });

    expect(buildMessage).toHaveBeenCalledWith(baseBon, 'https://app.test.local/signer/token-abc');
    expect(deps.sendEmail).toHaveBeenCalledWith('jean.dupont@exemple.fr', 'Signer', expect.any(String));
  });

  it('blocks the send without ever building the message when the app URL is missing (cas limite)', async () => {
    const deps = { ...makeDeps(), getAppUrl: jest.fn().mockResolvedValue('') };
    const buildMessage = jest.fn();

    await sendTokenSignatureRequest(deps as never, {
      bon: baseBon,
      token: 'token-abc',
      type: 'mise_dispo_request',
      templateId: 'mise_disposition_request',
      buildMessage,
    });

    expect(buildMessage).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('blocks the send when the collaborator has no email (cas limite)', async () => {
    const deps = { ...makeDeps(), getAppUrl: jest.fn().mockResolvedValue('https://app.test.local') };
    const buildMessage = jest.fn();

    await sendTokenSignatureRequest(deps as never, {
      bon: { ...baseBon, collaborateurEmail: null },
      token: 'token-abc',
      type: 'mise_dispo_request',
      templateId: 'mise_disposition_request',
      buildMessage,
    });

    expect(deps.getAppUrl).not.toHaveBeenCalled();
    expect(buildMessage).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});

describe('sendPrebuiltNotice', () => {
  it('sends the already-rendered HTML and logs the result (cas nominal)', async () => {
    const deps = makeDeps();

    await sendPrebuiltNotice(deps as never, {
      bonId: 'bon-1',
      recipientEmail: 'jean.dupont@exemple.fr',
      type: 'cancellation',
      html: '<p>Annulé</p>',
      subject: 'Bon annulé',
    });

    expect(deps.sendEmail).toHaveBeenCalledWith('jean.dupont@exemple.fr', 'Bon annulé', '<p>Annulé</p>');
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }),
    );
  });

  it('blocks the send when the recipient email is missing (cas limite)', async () => {
    const deps = makeDeps();

    await sendPrebuiltNotice(deps as never, {
      bonId: 'bon-1',
      recipientEmail: undefined,
      type: 'cancellation',
      html: '<p>Annulé</p>',
      subject: 'Bon annulé',
    });

    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});
