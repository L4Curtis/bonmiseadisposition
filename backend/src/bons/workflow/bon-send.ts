import { BadRequestException } from '@nestjs/common';
import type { LinkSignatureType } from '../../contracts/bons';
import { assertCanSendLink } from '../../common/can-send-link';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { assertSendable } from '../validation/bon-validators';
import { BonsWorkflowContext } from './bon-context';
import { assertActionAllowed, statusChangedMeanwhile } from './bon-guards';
import { assertItSigned, issueEmailLink, issueInPersonLink } from './bon-links';
import { assertSendChecksConfirmed, auditConfirmedChecks, SendConfirmations } from './bon-send-checks';
import { emitPvClotureIfDue } from './bon-cloture';
import { pendingDocument } from './state-machine';
import { writeAuditEntry } from '../../audit/audit-record';

/**
 * Remise d'un bon (brouillon → « Remise à signer ») et liens au guichet.
 *
 * Ordre imposé par le serveur, quelle que soit la voie : contrôles des
 * numéros (R-003), signature IT de la remise (R-022), puis le lien — par
 * email si `canSendLink` l'autorise (R-004, R-009), sinon au guichet.
 */

/** Passe le brouillon en « Remise à signer » (transition conditionnelle) et
 *  démarre l'horloge de la demande (`awaitingSince`). */
async function markHandoverRequested(ctx: BonsWorkflowContext, id: string, actorId: string | null, inPerson: boolean) {
  const transition = await ctx.prisma.bon.updateMany({
    where: { id, status: 'draft' },
    data: { status: 'sent_mise_dispo', awaitingSince: new Date() },
  });
  if (transition.count === 0) throw statusChangedMeanwhile();
  await writeAuditEntry(ctx.prisma, 'bon_sent', { actorId, bonId: id, details: { inPerson } });
}

/** Contrôles communs aux deux voies de remise, AVANT toute écriture. */
async function assertReadyForHandover(
  ctx: BonsWorkflowContext,
  id: string,
  confirmations: SendConfirmations,
  action: 'send' | 'send_in_person',
) {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, action);
  await assertSendable(ctx.prisma, bon);
  const checks = await assertSendChecksConfirmed(ctx.prisma, bon, confirmations);
  assertItSigned(bon, 'mise_disposition');
  return { bon, checks };
}

/** « Envoyer » : remise par email. */
export async function sendBon(
  ctx: BonsWorkflowContext,
  id: string,
  actorId: string | null,
  confirmations: SendConfirmations = {},
): Promise<void> {
  const { bon, checks } = await assertReadyForHandover(ctx, id, confirmations, 'send');
  assertCanSendLink(bon.collaborateur);
  await markHandoverRequested(ctx, id, actorId, false);
  await auditConfirmedChecks(ctx.prisma, id, actorId, checks);
  const sent = await findBonDetailOrThrow(ctx.prisma, id);
  await issueEmailLink(ctx, sent, 'mise_disposition', actorId);
}

/** Documents qu'on peut faire signer au guichet. */
export type InPersonDocument = LinkSignatureType;

/**
 * Lien de signature au guichet (QR code, 2 h) :
 *  - remise : depuis un brouillon (mêmes contrôles que l'envoi), ou pour
 *    réafficher le lien d'un bon « Remise à signer » ;
 *  - restitution : les équipements rendus sont déjà marqués (restitution au
 *    guichet : marquage, signature IT, puis ce lien) ;
 *  - PV de non-restitution : signable sur place (R-006), y compris pour un
 *    collaborateur sans adresse.
 */
export async function initiateInPersonSignature(
  ctx: BonsWorkflowContext,
  id: string,
  document: InPersonDocument,
  actorId: string,
  confirmations: SendConfirmations = {},
): Promise<string> {
  const current = await findBonDetailOrThrow(ctx.prisma, id);
  if (document === 'mise_disposition' && current.status === 'draft') {
    const { checks } = await assertReadyForHandover(ctx, id, confirmations, 'send_in_person');
    await markHandoverRequested(ctx, id, actorId, true);
    await auditConfirmedChecks(ctx.prisma, id, actorId, checks);
  } else {
    const facts = assertActionAllowed(current, 'show_in_person_link');
    const expected = pendingDocument(facts);
    if (expected !== document) throw new BadRequestException(inPersonMismatch(document));
    if (document === 'pv_cloture') await ensurePvEmitted(ctx, id, actorId);
  }
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  return issueInPersonLink(ctx, bon, document, actorId);
}

function inPersonMismatch(document: InPersonDocument): string {
  if (document === 'restitution') {
    return 'Aucune restitution n’attend de signature : sélectionnez d’abord les équipements rendus.';
  }
  if (document === 'pv_cloture') return 'Aucun PV de non-restitution n’attend de signature sur ce bon.';
  return 'La remise de ce bon n’attend pas de signature.';
}

/** Le PV doit exister (document émis, signature IT comprise) avant qu'on le
 *  fasse signer : c'est le cas sauf si son émission avait échoué. */
async function ensurePvEmitted(ctx: BonsWorkflowContext, id: string, actorId: string): Promise<void> {
  const emitted = await ctx.prisma.pdfSnapshot.findFirst({
    where: { bonId: id, type: 'cloture_equipements_manquants' },
    select: { id: true },
  });
  if (!emitted) await emitPvClotureIfDue(ctx, id, undefined, actorId, { sendEmail: false });
}
