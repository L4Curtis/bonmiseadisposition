import { BadRequestException } from '@nestjs/common';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext } from './bon-context';
import { assertActionAllowed } from './bon-guards';
import { issueEmailLink } from './bon-links';
import { emitPvClotureIfDue } from './bon-cloture';
import { pendingDocument } from './state-machine';
import { writeAuditEntry } from '../../audit/audit-record';

/** Un lien encore valide envoyé il y a moins d'une heure demande confirmation. */
const RECENT_LINK_MS = 60 * 60 * 1000;

/** Réponse d'un second « Renvoyer » rapproché : le lien vient de partir. */
const ALREADY_SENT_MESSAGE = 'Le lien vient d’être envoyé : aucun nouvel envoi.';

/**
 * « Renvoyer le lien » (fiche, liste, relance groupée) : envoie un nouveau
 * lien du document qui attend la signature du collaborateur, déterminé par la
 * machine à états depuis l'état métier — lien expiré, invalidé ou purgé
 * compris (R-005). Suit la règle `canSendLink` et exige la signature IT du
 * document (R-022). Première émission du PV incluse, s'il n'a jamais pu
 * partir. Un second appel rapproché (double clic) réutilise le lien qui
 * vient de partir : ni nouveau lien, ni nouvel email.
 */
export async function resendSignatureLink(ctx: BonsWorkflowContext, bonId: string, actorId: string, force = false) {
  const bon = await findBonDetailOrThrow(ctx.prisma, bonId);
  const facts = assertActionAllowed(bon, 'resend');
  const document = pendingDocument(facts);
  if (!document) throw new BadRequestException('Aucun document n’attend la signature du collaborateur.');

  let resent = false;
  if (document === 'pv_cloture' && !(await pvEverEmitted(ctx, bonId))) {
    const emitted = await emitPvClotureIfDue(ctx, bonId, undefined, actorId);
    if (!emitted) throw new BadRequestException('Le PV de non-restitution n’a pas pu être émis pour ce bon.');
  } else {
    // Seul un lien ENCORE VALIDE justifie l'avertissement : un lien expiré ou
    // invalidé se renvoie sans question (R-016). Contrôle fait sous le verrou
    // de l'émission, pour qu'un double clic ne crée pas deux liens.
    const refuseRecentWithinMs = force ? undefined : RECENT_LINK_MS;
    const issued = await issueEmailLink(ctx, bon, document, actorId, { refuseRecentWithinMs });
    if (issued.reused) return { ok: true as const, message: ALREADY_SENT_MESSAGE };
    resent = issued.resent === true;
  }

  // Premier envoi du document (restitution, nouvelle version après une
  // modification) ou renvoi du même document : deux phrases différentes.
  const details = { manual: true, document, documentName: LINK_DOCUMENT_NAMES[document] };
  await writeAuditEntry(ctx.prisma, resent ? 'reminder_sent' : 'signature_link_sent', { actorId, bonId, details });
  return { ok: true as const, message: resent ? 'Lien renvoyé avec succès' : 'Lien envoyé avec succès' };
}

/** Document du lien, dans la phrase du journal (« le lien de signature de la restitution »). */
const LINK_DOCUMENT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  mise_disposition: 'la mise à disposition',
  restitution: 'la restitution',
  pv_cloture: 'le PV de non-restitution',
});

async function pvEverEmitted(ctx: BonsWorkflowContext, bonId: string): Promise<boolean> {
  const snapshot = await ctx.prisma.pdfSnapshot.findFirst({
    where: { bonId, type: 'cloture_equipements_manquants' },
    select: { id: true },
  });
  return snapshot !== null;
}
