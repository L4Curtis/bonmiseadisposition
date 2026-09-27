import { Logger } from '@nestjs/common';
import type { SignatureType } from '@prisma/client';
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

/** Document concerné par une demande de signature ou un rappel : les rappels
 *  se comptent par document (R-033). `null` pour les autres emails. */
type LoggedDocument = Exclude<SignatureType, 'it_cachet'>;

function documentField(documentType: LoggedDocument | undefined) {
  return documentType ? { documentType } : {};
}

export interface LogSendResultInput {
  bonId: string;
  recipientEmail: string;
  type: NotificationType;
  result: SendEmailResult;
  reminderNumber?: number;
  documentType?: LoggedDocument;
}

/** Journalise le résultat (sent/failed) d'un envoi déjà tenté. */
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
      ...documentField(input.documentType),
    },
  });
}

export interface LogFailedNotificationInput {
  bonId: string;
  recipientEmail: string;
  type: NotificationType;
  errorMessage: string;
  reminderNumber?: number;
  documentType?: LoggedDocument;
}

/** Journalise un échec explicite SANS tentative d'envoi SMTP (ex : aucun
 *  destinataire IT actif, URL de l'application absente). C'est une panne à
 *  corriger : elle compte dans « emails en échec ». */
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
      ...documentField(input.documentType),
    },
  });
}

export interface LogSkippedNotificationInput {
  bonId: string;
  type: NotificationType;
  /** Pourquoi rien n'est parti, en français (affiché dans le journal du bon). */
  reason: string;
  recipientEmail?: string;
  documentType?: LoggedDocument;
}

/**
 * Journalise un email volontairement NON envoyé (R-034) : collaborateur sans
 * adresse (compagnon de chantier, signature au guichet), compte désactivé.
 * Ce n'est pas une panne : la ligne est « skipped », hors du compteur
 * « emails en échec ».
 */
export async function logSkippedNotification(
  prisma: PrismaService,
  input: LogSkippedNotificationInput,
): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      bonId: input.bonId,
      recipientEmail: input.recipientEmail ?? '',
      type: input.type,
      status: 'skipped',
      errorMessage: input.reason,
      ...documentField(input.documentType),
    },
  });
}

export const NO_EMAIL_REASON =
  "Le collaborateur n'a pas d'adresse email : aucun email envoyé (signature au guichet uniquement).";

/**
 * Garde commune aux envois vers un collaborateur : sans adresse (compte
 * manuel, compagnon de chantier), l'email n'est pas tenté ; une ligne
 * « skipped » l'indique. Renvoie true pour que l'appelant s'arrête.
 */
export async function blockIfEmailMissing(
  prisma: PrismaService,
  logger: Pick<Logger, 'log'>,
  bonId: string,
  recipientEmail: string | null | undefined,
  type: NotificationType,
  extra?: { documentType?: LoggedDocument },
): Promise<boolean> {
  if (recipientEmail) return false;
  logger.log(`Email non envoyé (bon ${bonId}, type ${type}) : collaborateur sans adresse`);
  await logSkippedNotification(prisma, { bonId, type, reason: NO_EMAIL_REASON, documentType: extra?.documentType });
  return true;
}

/**
 * Garde commune à tous les emails "à lien" (signature ou portail) : un lien
 * construit sur une app_url vide serait relatif (ex. "/signer/xxx") — un lien
 * mort silencieusement envoyé et journalisé "sent". Bloque l'envoi, journalise
 * explicitement l'échec (status 'failed') et retourne true pour que
 * l'appelant s'arrête sans envoyer.
 */
export async function blockIfAppUrlMissing(
  prisma: PrismaService,
  logger: Logger,
  appUrl: string,
  bonId: string,
  recipientEmail: string,
  type: NotificationType,
  extra?: { reminderNumber?: number; documentType?: LoggedDocument },
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
    documentType: extra?.documentType,
  });
  return true;
}
