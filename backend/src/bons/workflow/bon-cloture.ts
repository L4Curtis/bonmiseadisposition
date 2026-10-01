import { BON_REFERENCE_TX_OPTIONS } from '../../common/bon-reference';
import { assertPngDataUrl } from '../../common/signature-data-url';
import { generateSignatureToken } from '../../common/tokens';
import { canSendLink } from '../../common/can-send-link';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { documentFilename } from '../../pdf/snapshot-filename';
import { BON_DETAIL_SELECT } from '../bon-view';
import { BonsWorkflowContext, generateAndSaveSnapshot, getPvTokenValidityDays } from './bon-context';
import { ClientTrace, saveItSignatureWithTrace } from './bon-it-signature';
import { computeBonFacts } from './bon-facts';
import { pendingDocument } from './state-machine';
import { lockBonLinks } from './bon-links';

/** Options d'émission du PV. */
export interface EmitPvOptions {
  /** Envoyer le lien par email si le collaborateur peut le recevoir (défaut :
   *  oui). Faux pour un PV qu'on fait signer tout de suite au guichet. */
  readonly sendEmail?: boolean;
  /** Poste du technicien qui signe le PV (certificat de preuve). */
  readonly client?: ClientTrace;
}

/**
 * Émet le PV de non-restitution si — et seulement si — la machine à états dit
 * qu'il attend : « Restitution en cours », plus rien chez le collaborateur,
 * aucune restitution à signer, au moins un équipement déclaré non restitué.
 * Idempotent : un lien de PV encore valide n'est jamais régénéré.
 *
 * Appelé après une déclaration de non-restitution, un équipement retrouvé,
 * un renvoi, et par l'écouteur de `signature.signed` (restitution signée
 * alors qu'un équipement manque).
 *
 * Atomicité : le contrôle d'idempotence et la création du lien sont couverts
 * par le verrou des liens du bon (`lockBonLinks`, partagé avec l'envoi par
 * email et le guichet) posé dans la même transaction ; deux appels
 * concurrents ne produisent donc qu'un PV, et un renvoi ou un lien au guichet
 * simultané ne laisse pas deux liens valides. Les liens d'un autre document
 * encore en attente sont invalidés (« remplacé ») dans cette transaction.
 *
 * Sans adresse délivrable (ou compte désactivé), aucun lien n'est créé : le
 * PV est émis (document, signature IT) et se signe au guichet (R-006).
 *
 * @returns true si le PV a été émis, false sinon.
 */
export async function emitPvClotureIfDue(
  ctx: BonsWorkflowContext,
  bonId: string,
  itSignatureDataUrl?: string,
  actorId?: string | null,
  options: EmitPvOptions = {},
): Promise<boolean> {
  const { prisma, notificationService, logger } = ctx;
  const detail = await prisma.bon.findUnique({ where: { id: bonId }, ...BON_DETAIL_SELECT });
  if (!detail || pendingDocument(computeBonFacts(detail)) !== 'pv_cloture') return false;
  if (itSignatureDataUrl) assertPngDataUrl(itSignatureDataUrl);

  const recipient = canSendLink(detail.collaborateur);
  const withEmail = (options.sendEmail ?? true) && recipient.allowed;
  const validityDays = await getPvTokenValidityDays(ctx);

  const claimed = await prisma.$transaction(async (tx) => {
    await lockBonLinks(tx, bonId);
    const existing = await tx.signature.findFirst({
      where: { bonId, type: 'pv_cloture', signed: false, invalidatedAt: null, tokenExpiresAt: { gt: new Date() } },
    });
    if (existing) return { emitted: false, token: null };
    await tx.signature.updateMany({
      where: { bonId, signed: false, type: { not: 'it_cachet' }, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0), invalidatedAt: new Date(), invalidatedReason: 'replaced' },
    });
    await tx.bon.update({ where: { id: bonId }, data: { awaitingSince: new Date() } });
    if (!withEmail) return { emitted: true, token: null };
    const created = await tx.signature.create({
      data: {
        bonId,
        type: 'pv_cloture',
        token: generateSignatureToken(),
        tokenExpiresAt: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
        isInPerson: false,
        initiatedById: actorId ?? null,
      },
    });
    return { emitted: true, token: created.token };
  }, BON_REFERENCE_TX_OPTIONS);
  if (!claimed.emitted) return false;

  if (itSignatureDataUrl && actorId) {
    await saveItSignatureWithTrace(ctx, bonId, itSignatureDataUrl, actorId, options.client);
  }
  await savePvDocument(ctx, bonId);

  if (claimed.token && recipient.allowed) {
    notificationService
      .sendPvClotureRequest({ ...detail, collaborateurEmail: recipient.email }, claimed.token)
      .catch((err: unknown) => logger.error(`Email du PV (${detail.reference}) : ${String(err)}`));
  }
  await prisma.auditLog.create({
    data: {
      bonId,
      userId: actorId ?? null,
      action: 'pv_cloture_emitted',
      details: { notReturnedCount: detail.equipments.filter((e) => e.notReturned).length, emailSent: !!claimed.token },
    },
  });
  logger.log(`Bon ${detail.reference} — PV de non-restitution émis${claimed.token ? ' et envoyé' : ' (signature au guichet)'}`);
  return true;
}

/** Document du PV, version signée par l'IT (réécrit après la co-signature). */
async function savePvDocument(ctx: BonsWorkflowContext, bonId: string): Promise<void> {
  const { prisma, smbService, logger } = ctx;
  const bon = await findBonDetailOrThrow(prisma, bonId);
  // Signatures COMPLÈTES (IP, navigateur) : le certificat de preuve du PDF en
  // a besoin ; le PDF lit lui-même les images de son document.
  const fullSignatures = await prisma.signature.findMany({ where: { bonId } });

  // Un nom daté par document : le PV réécrit après la co-signature n'écrase
  // ni la version signée par l'IT seule, ni son fichier sur le partage.
  const filename = documentFilename(bon, 'cloture_equipements_manquants', new Date(), { itVersion: true });
  const pdfBuffer = await generateAndSaveSnapshot(
    ctx,
    bonId,
    { ...bon, signatures: fullSignatures },
    'cloture_equipements_manquants',
    null,
    filename,
  );
  if (pdfBuffer) {
    smbService.exportPdf(bon, filename, pdfBuffer).catch((err) =>
      logger.error(`Échec export SMB [${bon.reference}]: ${(err as Error).message}`),
    );
  }
}
