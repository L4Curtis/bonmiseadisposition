import { BadRequestException } from '@nestjs/common';
import { assertPngDataUrl } from '../../common/signature-data-url';
import { findBonDetailOrThrow } from '../queries/bon-where';
import { documentFilename } from '../../pdf/snapshot-filename';
import { BonsWorkflowContext, generateAndSaveSnapshot } from './bon-context';
import { assertActionAllowed } from './bon-guards';
import { invalidatePendingLinks } from './bon-links';
import { applyReturnChange } from './bon-restitution';
import { ClientTrace, saveItSignatureWithTrace } from './bon-it-signature';
import { writeAuditEntry } from '../../audit/audit-record';

/**
 * L'IT retrouve des équipements déclarés non restitués.
 *  - Bon clôturé : un avenant signé par l'IT est émis, le bon reste clôturé.
 *  - Bon « Restitution en cours » : les équipements passent « rendus, à
 *    signer ». Le PV en attente (ou le lien de restitution) ne correspond plus
 *    à la réalité : son lien est invalidé (« remplacé »). La suite est la
 *    restitution habituelle : signature IT de restitution, puis le lien. Le PV
 *    repartira de lui-même après cette signature s'il reste une perte.
 */
export async function markFound(
  ctx: BonsWorkflowContext,
  id: string,
  equipmentIds: readonly string[],
  actorId: string,
  signatureDataUrl?: string,
  client?: ClientTrace,
): Promise<void> {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'mark_found');
  const ids = [...new Set(equipmentIds)];
  if (ids.length === 0) throw new BadRequestException('Aucun équipement sélectionné.');
  if (signatureDataUrl) assertPngDataUrl(signatureDataUrl);
  const wasArchived = bon.status === 'archived';

  await ctx.prisma.$transaction(async (tx) => {
    const marked = await tx.bonEquipment.updateMany({
      where: { id: { in: ids }, bonId: id, notReturned: true },
      data: { notReturned: false, notReturnedReason: null, returnedAt: new Date() },
    });
    if (marked.count !== ids.length) {
      throw new BadRequestException('Certains équipements sélectionnés ne sont pas déclarés non restitués sur ce bon.');
    }
    await writeAuditEntry(tx, 'mark_found', { actorId, bonId: id, details: { equipmentIds: ids, wasArchived } });
    if (!wasArchived) {
      await invalidatePendingLinks(tx, id, 'replaced');
      await applyReturnChange(tx, id, true);
    }
  });

  if (wasArchived) await emitFoundAvenant(ctx, id, ids, actorId, signatureDataUrl, client);
}

/** Avenant « équipement retrouvé » d'un bon clôturé (signature IT seule),
 *  et information du collaborateur. */
async function emitFoundAvenant(
  ctx: BonsWorkflowContext,
  id: string,
  ids: readonly string[],
  actorId: string,
  signatureDataUrl?: string,
  client?: ClientTrace,
): Promise<void> {
  const { prisma, notificationService, smbService, logger } = ctx;
  if (signatureDataUrl) await saveItSignatureWithTrace(ctx, id, signatureDataUrl, actorId, client);
  const bon = await findBonDetailOrThrow(prisma, id);
  const fullSignatures = await prisma.signature.findMany({ where: { bonId: id } });

  const filename = documentFilename(bon, 'avenant_equipement_retrouve', new Date());
  const pdfBuffer = await generateAndSaveSnapshot(
    ctx,
    id,
    { ...bon, signatures: fullSignatures, _avenantEquipmentIds: [...ids] },
    'avenant_equipement_retrouve',
    null,
    filename,
  );
  if (pdfBuffer) {
    smbService.exportPdf(bon, filename, pdfBuffer).catch((err) =>
      logger.error(`Échec export SMB [${bon.reference}]: ${(err as Error).message}`),
    );
  }
  notificationService
    .sendMarkFoundNotice(bon, [...ids])
    .catch((err: unknown) => logger.error(`Email « équipement retrouvé » (${bon.reference}) : ${String(err)}`));
  logger.log(`Bon ${bon.reference} (clôturé) — avenant émis pour ${ids.length} équipement(s) retrouvé(s)`);
}
