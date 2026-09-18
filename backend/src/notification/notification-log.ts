import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '../common/types';

/** Résultat d'un envoi d'email : conserve le détail de l'erreur SMTP réelle
 *  (au lieu d'un libellé générique) pour la persister dans NotificationLog. */
export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

const MAX_ERROR_MESSAGE_LENGTH = 500;

/** Tronque le message d'erreur avant persistance (colonne errorMessage). */
export function truncateErrorMessage(error: string | undefined): string {
  const message = error ?? "Erreur d'envoi inconnue";
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : message;
}

export interface LogSendResultInput {
  bonId: string;
  recipientEmail: string;
  type: NotificationType;
  result: SendEmailResult;
  reminderNumber?: number;
}

/** Journalise le résultat (sent/failed) d'un envoi déjà tenté — factorisation
 *  du pattern répété après chaque sendXxx de NotificationService. */
export async function logNotificationResult(
  prisma: PrismaService,
  input: LogSendResultInput,
): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      bonId: input.bonId,
      recipientEmail: input.recipientEmail,
      type: input.type,
      status: input.result.ok ? 'sent' : 'failed',
      errorMessage: input.result.ok ? null : truncateErrorMessage(input.result.error),
      ...(input.reminderNumber !== undefined ? { reminderNumber: input.reminderNumber } : {}),
    },
  });
}

export interface LogFailedNotificationInput {
  bonId: string;
  recipientEmail: string;
  type: NotificationType;
  errorMessage: string;
  reminderNumber?: number;
}

/** Journalise un échec explicite SANS tentative d'envoi SMTP (ex : aucun
 *  destinataire IT actif). Contrairement à logNotificationResult, il n'y a pas
 *  de SendEmailResult à consigner : le message d'erreur est déjà connu. */
export async function logFailedNotification(
  prisma: PrismaService,
  input: LogFailedNotificationInput,
): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      bonId: input.bonId,
      recipientEmail: input.recipientEmail,
      type: input.type,
      status: 'failed',
      errorMessage: input.errorMessage,
      ...(input.reminderNumber !== undefined ? { reminderNumber: input.reminderNumber } : {}),
    },
  });
}

/**
 * Garde commune à tous les envois de notification par email : un collaborateur
 * créé manuellement (compagnon de chantier, cf. User.isManualAccount) n'a pas
 * d'adresse email — ce n'est pas une erreur technique, juste un destinataire
 * qui ne peut pas recevoir d'email (il signe en présentiel). Bloque l'envoi
 * AVANT toute tentative SMTP, journalise explicitement (status 'failed', avec
 * un message métier plutôt qu'une erreur SMTP) et retourne true pour que
 * l'appelant s'arrête sans envoyer.
 */
export async function blockIfEmailMissing(
  prisma: PrismaService,
  logger: Logger,
  bonId: string,
  recipientEmail: string | null | undefined,
  type: NotificationType,
  extra?: { reminderNumber?: number },
): Promise<boolean> {
  if (recipientEmail) return false;

  const errorMessage = 'Adresse email du collaborateur absente — signature/notification présentielle, aucun email envoyé';
  logger.log(`Email non envoyé (bon ${bonId}, type ${type}) : ${errorMessage}`);
  await logFailedNotification(prisma, {
    bonId,
    recipientEmail: '',
    type,
    errorMessage,
    reminderNumber: extra?.reminderNumber,
  });
  return true;
}

/**
 * Garde commune à tous les emails "à lien" (signature ou portail) : un lien
 * construit sur une app_url vide serait relatif (ex. "/signer/xxx" ou
 * "/mes-bons") — un lien mort silencieusement envoyé et journalisé "sent".
 * Bloque l'envoi, journalise explicitement l'échec (status 'failed') et
 * retourne true pour que l'appelant s'arrête sans envoyer.
 */
export async function blockIfAppUrlMissing(
  prisma: PrismaService,
  logger: Logger,
  appUrl: string,
  bonId: string,
  recipientEmail: string,
  type: NotificationType,
  extra?: { reminderNumber?: number },
): Promise<boolean> {
  if (appUrl) return false;

  const errorMessage = "URL de l'application (general.app_url) non configurée";
  logger.error(`Email non envoyé (bon ${bonId}, type ${type}) : ${errorMessage}`);
  await logFailedNotification(prisma, {
    bonId,
    recipientEmail,
    type,
    errorMessage,
    reminderNumber: extra?.reminderNumber,
  });
  return true;
}
