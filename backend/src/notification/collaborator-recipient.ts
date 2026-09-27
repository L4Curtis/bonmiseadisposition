import type { SignatureType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '../common/types';
import { CanSendLinkResult, LinkRefused, canSendLink } from '../common/can-send-link';
import { NO_EMAIL_REASON, logFailedNotification, logSkippedNotification } from './notification-log';

/**
 * Destinataire d'un email au collaborateur : l'adresse ACTUELLE de son
 * compte (décision du 25/09 : `Bon.collaborateurEmail` reste une trace), et
 * seulement si le compte est actif et l'adresse délivrable — la règle unique
 * `canSendLink` (R-004).
 */

type LoggedDocument = Exclude<SignatureType, 'it_cachet'>;

/** Compte du collaborateur du bon, tel qu'il est maintenant. */
export async function resolveCollaboratorRecipient(prisma: PrismaService, bonId: string): Promise<CanSendLinkResult> {
  const bon = await prisma.bon.findUnique({
    where: { id: bonId },
    select: { collaborateur: { select: { active: true, email: true } } },
  });
  return canSendLink(bon?.collaborateur ?? { active: false, email: null });
}

/** Motif en clair d'un email non envoyé, pour le journal du bon. */
const REFUSAL_LOG_REASONS: Readonly<Record<LinkRefused['reason'], string>> = Object.freeze({
  inactive_account: 'Compte du collaborateur désactivé : aucun email envoyé.',
  no_email: NO_EMAIL_REASON,
  undeliverable_email: "Adresse email du collaborateur non valide : corrigez l'adresse du compte.",
});

/** Texte enregistré dans le journal pour un destinataire refusé : permet de
 *  ne l'écrire qu'une fois par document (rappels quotidiens). */
export function refusalLogReason(refusal: LinkRefused): string {
  return REFUSAL_LOG_REASONS[refusal.reason];
}

/**
 * Journalise un email non envoyé faute de destinataire valable. Compte
 * désactivé ou collaborateur sans adresse : ce n'est pas une panne (ligne
 * « skipped », hors des emails en échec, R-034). Adresse invalide : c'est
 * une donnée à corriger (ligne « failed »).
 */
export async function logRefusedRecipient(
  prisma: PrismaService,
  input: { bonId: string; type: NotificationType; refusal: LinkRefused; documentType?: LoggedDocument },
): Promise<void> {
  const reason = refusalLogReason(input.refusal);
  if (input.refusal.reason === 'undeliverable_email') {
    await logFailedNotification(prisma, {
      bonId: input.bonId, recipientEmail: '', type: input.type, errorMessage: reason, documentType: input.documentType,
    });
    return;
  }
  await logSkippedNotification(prisma, { bonId: input.bonId, type: input.type, reason, documentType: input.documentType });
}
