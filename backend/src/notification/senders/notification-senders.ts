import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplatesService } from '../../templates/templates.service';
import { NotificationBon, NotificationType } from '../../common/types';
import {
  SendEmailResult,
  logNotificationResult,
  blockIfAppUrlMissing,
  blockIfEmailMissing,
} from '../notification-log';

export interface NotificationSendDeps {
  prisma: PrismaService;
  logger: Logger;
  templatesService: TemplatesService;
  sendEmail: (to: string, subject: string, html: string) => Promise<SendEmailResult>;
}

export interface TemplatedNotificationParams {
  bonId: string;
  recipientEmail: string | null | undefined;
  type: NotificationType;
  templateId: string;
  vars: Record<string, string>;
  subject: string;
}

/**
 * Envoi générique "un email de template déjà résolu" — factorise le pattern
 * répété (email manquant → blocage journalisé ; sinon rendu + envoi +
 * journalisation du résultat) commun à sendSignatureConfirmation et
 * sendContestationResolution.
 */
export async function sendTemplatedNotification(
  deps: NotificationSendDeps,
  params: TemplatedNotificationParams,
): Promise<void> {
  const { bonId, recipientEmail, type, templateId, vars, subject } = params;
  if (!recipientEmail) {
    await blockIfEmailMissing(deps.prisma, deps.logger, bonId, recipientEmail, type);
    return;
  }
  const html = await deps.templatesService.renderTemplate(templateId, vars);
  const result = await deps.sendEmail(recipientEmail, subject, html);
  await logNotificationResult(deps.prisma, { bonId, recipientEmail, type, result });
}

export interface TokenSignatureRequestParams {
  bon: NotificationBon;
  token: string;
  type: NotificationType;
  templateId: string;
  buildMessage: (bon: NotificationBon, signerUrl: string) => { vars: Record<string, string>; subject: string };
}

/**
 * Envoi générique "email à lien de signature" — factorise le pattern répété
 * (email manquant, puis app_url manquante, sinon construction du lien +
 * rendu + envoi + journalisation) commun aux trois demandes de signature
 * (mise à disposition, restitution, PV de clôture).
 */
export async function sendTokenSignatureRequest(
  deps: NotificationSendDeps & { getAppUrl: () => Promise<string> },
  params: TokenSignatureRequestParams,
): Promise<void> {
  const { bon, token, type, templateId, buildMessage } = params;
  const recipientEmail = bon.collaborateurEmail;
  if (!recipientEmail) {
    await blockIfEmailMissing(deps.prisma, deps.logger, bon.id, recipientEmail, type);
    return;
  }
  const appUrl = await deps.getAppUrl();
  if (await blockIfAppUrlMissing(deps.prisma, deps.logger, appUrl, bon.id, recipientEmail, type)) {
    return;
  }

  const { vars, subject } = buildMessage(bon, `${appUrl}/signer/${token}`);
  const html = await deps.templatesService.renderTemplate(templateId, vars);
  const result = await deps.sendEmail(recipientEmail, subject, html);

  await logNotificationResult(deps.prisma, { bonId: bon.id, recipientEmail, type, result });
}

export interface PrebuiltNoticeParams {
  bonId: string;
  recipientEmail: string | null | undefined;
  type: NotificationType;
  html: string;
  subject: string;
}

/**
 * Envoi générique "notice système déjà rendue en HTML" (pas de
 * TemplatesService/renderTemplate) — factorise le pattern répété commun aux
 * notices d'annulation, d'équipement(s) retrouvé(s) et de clôture unilatérale.
 */
export async function sendPrebuiltNotice(
  deps: Pick<NotificationSendDeps, 'prisma' | 'logger' | 'sendEmail'>,
  params: PrebuiltNoticeParams,
): Promise<void> {
  const { bonId, recipientEmail, type, html, subject } = params;
  if (!recipientEmail) {
    await blockIfEmailMissing(deps.prisma, deps.logger, bonId, recipientEmail, type);
    return;
  }
  const result = await deps.sendEmail(recipientEmail, subject, html);
  await logNotificationResult(deps.prisma, { bonId, recipientEmail, type, result });
}
