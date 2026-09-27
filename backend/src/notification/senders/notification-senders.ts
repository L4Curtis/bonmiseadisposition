import { Logger } from '@nestjs/common';
import type { SignatureType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplatesService } from '../../templates/templates.service';
import { NotificationBon, NotificationType } from '../../common/types';
import {
  SendEmailResult,
  logNotificationResult,
  blockIfAppUrlMissing,
  blockIfEmailMissing,
} from '../notification-log';
import { logRefusedRecipient, resolveCollaboratorRecipient } from '../collaborator-recipient';

/** Pièce jointe d'un email (le PDF signé d'une confirmation). */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export type SendEmailFn = (to: string, subject: string, html: string, attachments?: EmailAttachment[]) => Promise<SendEmailResult>;

export interface NotificationSendDeps {
  prisma: PrismaService;
  logger: Logger;
  templatesService: TemplatesService;
  sendEmail: SendEmailFn;
}

type LinkDocument = Exclude<SignatureType, 'it_cachet'>;

/** Document de chaque demande de signature (les rappels et le journal se
 *  comptent par document). */
const REQUEST_DOCUMENT: Readonly<Partial<Record<NotificationType, LinkDocument>>> = Object.freeze({
  mise_dispo_request: 'mise_disposition',
  restitution_request: 'restitution',
  pv_cloture_request: 'pv_cloture',
});

export interface TokenSignatureRequestParams {
  bon: NotificationBon;
  token: string;
  type: NotificationType;
  templateId: string;
  buildMessage: (bon: NotificationBon, signerUrl: string) => { vars: Record<string, string>; subject: string };
}

/**
 * Email « document à signer » (remise, restitution, PV). L'adresse est celle
 * que l'appelant a retenue après `canSendLink` (adresse actuelle du compte) ;
 * sans adresse, une ligne « non envoyé » ; sans URL publique, un échec.
 */
export async function sendTokenSignatureRequest(
  deps: NotificationSendDeps & { getAppUrl: () => Promise<string> },
  params: TokenSignatureRequestParams,
): Promise<void> {
  const { bon, token, type, templateId, buildMessage } = params;
  const documentType = REQUEST_DOCUMENT[type];
  const recipientEmail = bon.collaborateurEmail;
  if (!recipientEmail) {
    await blockIfEmailMissing(deps.prisma, deps.logger, bon.id, recipientEmail, type, { documentType });
    return;
  }
  const appUrl = await deps.getAppUrl();
  if (await blockIfAppUrlMissing(deps.prisma, deps.logger, appUrl, bon.id, recipientEmail, type, { documentType })) {
    return;
  }

  const { vars, subject } = buildMessage(bon, `${appUrl}/signer/${token}`);
  const html = await deps.templatesService.renderTemplate(templateId, vars);
  const result = await deps.sendEmail(recipientEmail, subject, html);
  await logNotificationResult(deps.prisma, { bonId: bon.id, recipientEmail, type, result, documentType });
}

/** Email prêt à partir, construit une fois le destinataire connu. */
export interface BuiltEmail {
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface CollaboratorEmailParams {
  bonId: string;
  type: NotificationType;
  documentType?: LinkDocument;
  build: () => Promise<BuiltEmail> | BuiltEmail;
}

/**
 * Email d'information au collaborateur (confirmation, annulation, gestes sans
 * signature, équipement retrouvé), envoyé à l'adresse ACTUELLE de son compte
 * si le compte est actif (canSendLink). Sinon : une ligne « non envoyé »
 * (compte désactivé, pas d'adresse) ou « échec » (adresse invalide).
 */
export async function sendCollaboratorEmail(
  deps: Pick<NotificationSendDeps, 'prisma' | 'sendEmail'>,
  params: CollaboratorEmailParams,
): Promise<void> {
  const recipient = await resolveCollaboratorRecipient(deps.prisma, params.bonId);
  if (!recipient.allowed) {
    await logRefusedRecipient(deps.prisma, { bonId: params.bonId, type: params.type, refusal: recipient, documentType: params.documentType });
    return;
  }
  const result = await buildAndSend(deps, params, recipient.email);
  await logNotificationResult(deps.prisma, {
    bonId: params.bonId, recipientEmail: recipient.email, type: params.type, result, documentType: params.documentType,
  });
}

/** Construit puis envoie l'email. Un email impossible à construire (modèle
 *  illisible, PDF joint introuvable…) devient un échec du journal du bon,
 *  visible par l’IT (emails en échec), au lieu d’une erreur perdue dans les logs. */
async function buildAndSend(
  deps: Pick<NotificationSendDeps, 'sendEmail'>,
  params: CollaboratorEmailParams,
  to: string,
): Promise<SendEmailResult> {
  let email: BuiltEmail;
  try {
    email = await params.build();
  } catch (err) {
    return { ok: false, error: `Email non construit : ${err instanceof Error ? err.message : String(err)}` };
  }
  return deps.sendEmail(to, email.subject, email.html, email.attachments);
}
