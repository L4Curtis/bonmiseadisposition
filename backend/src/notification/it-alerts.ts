import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '../common/types';
import { findItAlertRecipients } from './it-alert-recipients';
import { SendEmailResult, logFailedNotification, logNotificationResult } from './notification-log';

/**
 * Envoi d'une alerte sur un bon à toute l'équipe informatique (tous les
 * administrateurs et techniciens actifs à l'adresse délivrable). Une ligne
 * du journal du bon trace l'envoi : envoyé si au moins un destinataire l'a
 * reçu, échec sinon (avec le détail).
 */

export interface ItAlertDeps {
  prisma: PrismaService;
  logger: Pick<Logger, 'warn'>;
  sendEmail: (to: string, subject: string, html: string) => Promise<SendEmailResult>;
}

export interface ItAlert {
  bonId: string;
  bonReference: string;
  type: NotificationType;
  subject: string;
  html: string;
}

const NO_IT_RECIPIENT = 'Aucun administrateur ni technicien actif avec une adresse email valide';

export async function sendItAlert(deps: ItAlertDeps, alert: ItAlert): Promise<void> {
  const recipients = await findItAlertRecipients(deps.prisma);
  if (recipients.length === 0) {
    deps.logger.warn(`Alerte ${alert.type} non envoyée (bon ${alert.bonReference}) : ${NO_IT_RECIPIENT}`);
    await logFailedNotification(deps.prisma, { bonId: alert.bonId, recipientEmail: '', type: alert.type, errorMessage: NO_IT_RECIPIENT });
    return;
  }
  const results = await Promise.all(recipients.map((email) => deps.sendEmail(email, alert.subject, alert.html)));
  const anyOk = results.some((r) => r.ok);
  const combinedError = results
    .filter((r) => !r.ok)
    .map((r) => r.error ?? "Erreur d'envoi inconnue")
    .join('; ');
  await logNotificationResult(deps.prisma, {
    bonId: alert.bonId,
    recipientEmail: recipients.join(', '),
    type: alert.type,
    result: anyOk ? { ok: true } : { ok: false, error: combinedError },
  });
}
