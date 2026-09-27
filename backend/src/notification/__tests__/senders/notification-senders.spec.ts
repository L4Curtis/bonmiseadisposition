import { Logger } from '@nestjs/common';
import {
  sendTokenSignatureRequest,
  sendCollaboratorEmail,
} from '../../senders/notification-senders';
import { createMockPrismaService } from '../../../common/__tests__/helpers/mock-prisma';
import { createMockTemplatesService } from '../../../common/__tests__/helpers/mock-services';
import { NotificationBon } from '../../../common/types';
import type { Mock } from 'vitest';

const asMock = (fn: unknown): Mock => fn as Mock;

function makeDeps() {
  const prisma = createMockPrismaService();
  const templatesService = createMockTemplatesService();
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
  const sendEmail = vi.fn().mockResolvedValue({ ok: true });
  asMock(prisma.notificationLog.create).mockResolvedValue({});
  return { prisma, templatesService, logger, sendEmail };
}

const baseBon: NotificationBon = {
  id: 'bon-1',
  reference: 'BON-2026-0001',
  civilite: 'mr',
  collaborateurEmail: 'jean.dupont@exemple.fr',
};

describe('sendTokenSignatureRequest', () => {
  it('builds the signer URL from the app URL and token, then sends (cas nominal)', async () => {
    const deps = { ...makeDeps(), getAppUrl: vi.fn().mockResolvedValue('https://app.test.local') };
    const buildMessage = vi.fn().mockReturnValue({ vars: { SIGNER_URL: 'x' }, subject: 'Signer' });

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
    const deps = { ...makeDeps(), getAppUrl: vi.fn().mockResolvedValue('') };
    const buildMessage = vi.fn();

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
    const deps = { ...makeDeps(), getAppUrl: vi.fn().mockResolvedValue('https://app.test.local') };
    const buildMessage = vi.fn();

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

describe('sendCollaboratorEmail — adresse actuelle du compte, compte actif (R-004, R-008)', () => {
  const email = { subject: 'Bon annulé', html: '<p>Annulé</p>' };

  function withAccount(account: { active: boolean; email: string | null } | null) {
    const deps = makeDeps();
    asMock(deps.prisma.bon.findUnique).mockResolvedValue(account ? { collaborateur: account } : null);
    return deps;
  }

  it('envoie à l’adresse ACTUELLE du compte, pas à celle recopiée sur le bon', async () => {
    const deps = withAccount({ active: true, email: 'nouvelle.adresse@exemple.fr' });
    await sendCollaboratorEmail(deps as never, { bonId: 'bon-1', type: 'cancellation', build: () => email });
    expect(deps.sendEmail).toHaveBeenCalledWith('nouvelle.adresse@exemple.fr', 'Bon annulé', '<p>Annulé</p>', undefined);
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent', recipientEmail: 'nouvelle.adresse@exemple.fr' }) }),
    );
  });

  it('compte désactivé : rien n’est envoyé, une ligne « non envoyé » (pas un échec)', async () => {
    const deps = withAccount({ active: false, email: 'parti@exemple.fr' });
    const build = vi.fn(() => email);
    await sendCollaboratorEmail(deps as never, { bonId: 'bon-1', type: 'unilateral_closure', build });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'skipped', errorMessage: expect.stringContaining('désactivé') }) }),
    );
  });

  it('collaborateur sans adresse : ligne « non envoyé » (R-034)', async () => {
    const deps = withAccount({ active: true, email: null });
    await sendCollaboratorEmail(deps as never, { bonId: 'bon-1', type: 'confirmation', documentType: 'restitution', build: () => email });
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'skipped', documentType: 'restitution' }) }),
    );
  });

  it('email impossible à construire (modèle, PDF joint) : un échec tracé dans le journal du bon, sans rien envoyer', async () => {
    const deps = withAccount({ active: true, email: 'lea@exemple.fr' });
    const build = vi.fn(async () => {
      throw new Error('Modèle « confirmation_restitution » introuvable');
    });
    await expect(
      sendCollaboratorEmail(deps as never, { bonId: 'bon-1', type: 'confirmation', documentType: 'restitution', build }),
    ).resolves.toBeUndefined();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          type: 'confirmation',
          documentType: 'restitution',
          recipientEmail: 'lea@exemple.fr',
          errorMessage: expect.stringContaining('introuvable'),
        }),
      }),
    );
  });

  it('adresse invalide : un échec à corriger', async () => {
    const deps = withAccount({ active: true, email: 'pas-une-adresse' });
    await sendCollaboratorEmail(deps as never, { bonId: 'bon-1', type: 'cancellation', build: () => email });
    expect(deps.prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});
