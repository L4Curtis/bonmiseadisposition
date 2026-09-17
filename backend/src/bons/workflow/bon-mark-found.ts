import { BadRequestException, ConflictException } from '@nestjs/common';
import { assertPngDataUrl } from '../../common/signature-data-url';
import { BON_SELECT, findBonOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext, assertNoPendingRestitutionSignature, generateAndSaveSnapshot } from './bon-context';
import { emitPvClotureIfDue } from './bon-cloture';

/**
 * IT marks previously not-returned equipment as found.
 * - Bon archived: generates an IT-only avenant PDF, bon stays archived.
 * - Bon partially_returned :
 *   - des équipements restent en attente de restitution (jamais traités par
 *     initiateRestitution) → rien n'est émis, juste l'audit + la signature IT ;
 *   - plus rien en attente et plus aucun non-rendu → passage en sent_restitution ;
 *   - plus rien en attente mais des équipements restent non rendus → PV régénéré.
 */
export async function markFound(
  ctx: BonsWorkflowContext,
  id: string,
  equipmentIds: string[],
  userId: string,
  signatureDataUrl?: string,
) {
  const { prisma, signatureService, notificationService, smbService, logger } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  // 'active' is excluded: an active bon has no notReturned equipment, and the
  // no-op updateMany used to propel it straight into sent_restitution
  if (!['partially_returned', 'archived'].includes(bon.status))
    throw new BadRequestException('Action impossible sur ce bon');

  if (!equipmentIds?.length) throw new BadRequestException('Aucun équipement sélectionné');
  const ids = [...new Set(equipmentIds)];

  if (signatureDataUrl) {
    assertPngDataUrl(signatureDataUrl);
  }

  // Une signature de restitution en attente ne doit pas être écrasée par un
  // marquage "retrouvé" pendant qu'elle est en vol chez le collaborateur.
  await assertNoPendingRestitutionSignature(ctx, id);

  // Marquage des équipements + calcul de l'état résultant + transition
  // conditionnelle (le cas échéant) dans LA MÊME transaction.
  const { pending, advancedToRestitution } = await prisma.$transaction(async (tx) => {
    // Mark equipment as found (returned)
    const marked = await tx.bonEquipment.updateMany({
      where: {
        id: { in: ids },
        bonId: id,
        notReturned: true,
      },
      data: { notReturned: false, notReturnedReason: null, returnedAt: new Date() },
    });
    if (marked.count !== ids.length) {
      throw new BadRequestException(
        'Certains équipements sélectionnés ne sont pas déclarés non rendus sur ce bon',
      );
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        bonId: id,
        userId,
        action: 'mark_found',
        details: { equipmentIds: ids, wasArchived: bon.status === 'archived' },
      },
    });

    if (bon.status === 'archived') {
      // Rien d'autre à calculer : le bon reste archivé, avenant IT-only.
      return { pending: 0, stillNotReturned: 0, advancedToRestitution: false };
    }

    // Pending = équipements ni rendus ni déclarés non rendus (jamais traités
    // par initiateRestitution). Tant qu'il en reste, ni PV ni restitution ne
    // doivent être émis — le bon reste partially_returned en silence.
    const [pendingCount, stillNotReturnedCount] = await Promise.all([
      tx.bonEquipment.count({ where: { bonId: id, returnedAt: null, notReturned: false } }),
      tx.bonEquipment.count({ where: { bonId: id, notReturned: true } }),
    ]);

    let advanced = false;
    if (pendingCount === 0 && stillNotReturnedCount === 0) {
      // ── All equipment resolved → advance to sent_restitution ──────────
      const transition = await tx.bon.updateMany({
        where: { id, status: 'partially_returned' },
        data: { status: 'sent_restitution' },
      });
      if (transition.count === 0) {
        throw new ConflictException('Le statut du bon a changé, rechargez la page');
      }
      advanced = true;
    }

    return { pending: pendingCount, stillNotReturned: stillNotReturnedCount, advancedToRestitution: advanced };
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const signerEmail = user?.email ?? 'unknown';

  if (bon.status === 'archived') {
    // ── Bon already archived: generate IT-only avenant, keep archived ──────
    if (signatureDataUrl) {
      await signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
    }

    // Reload bon + fresh full signatures (signatureImagePath/signerIp/UA
    // requis pour un certificat de preuve complet — cf. correction #5)
    const updatedBon = await prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });
    const fullSignatures = await prisma.signature.findMany({ where: { bonId: id } });
    const sigImages = await signatureService.getSignatureImagesForBon(fullSignatures);
    if (signatureDataUrl) sigImages.it = signatureDataUrl;

    const collabName = smbService.sanitizeName(updatedBon.collaborateur?.displayName || 'INCONNU');
    const filename = `${updatedBon.reference}_${collabName}_avenant_equipement_retrouve.pdf`;

    // Pass found equipment IDs so the PDF renders only those
    const bonWithContext = { ...updatedBon, signatures: fullSignatures, _avenantEquipmentIds: ids };
    const pdfBuffer = await generateAndSaveSnapshot(
      ctx,
      id,
      bonWithContext,
      'avenant_equipement_retrouve',
      sigImages,
      filename,
    );
    if (pdfBuffer) {
      smbService.exportPdf(updatedBon, filename, pdfBuffer).catch((err) =>
        logger.error(`Échec export SMB [${updatedBon.reference}]: ${(err as Error).message}`),
      );
    }

    logger.log(
      `Bon ${updatedBon.reference} (archivé) — avenant IT généré pour équipement retrouvé`,
    );
    // Inform the collaborator that the previously-lost equipment was found
    notificationService.sendMarkFoundNotice(updatedBon, ids).catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));
    return findBonOrThrow(prisma, id);
  }

  if (pending > 0) {
    // Des équipements restent en attente de restitution (jamais traités par
    // initiateRestitution) : ni PV ni token tant qu'ils ne sont pas résolus.
    // La signature IT est conservée immédiatement pour ne pas être perdue.
    if (signatureDataUrl) {
      await signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
    }
    await prisma.auditLog.create({
      data: {
        bonId: id,
        userId,
        action: 'mark_found_partial',
        details: { pending, message: 'Équipements encore en attente de restitution avant PV/restitution' },
      },
    });
    logger.log(
      `Bon ${id} — équipement(s) retrouvé(s), ${pending} équipement(s) encore en attente de restitution`,
    );
    return findBonOrThrow(prisma, id);
  }

  if (advancedToRestitution) {
    // ── All equipment found → advance to sent_restitution ──────────────
    // L'ancien lien (pv_cloture ou restitution résiduel) ne doit pas rester
    // signable après cette transition — generateToken() est appelé
    // directement ici (pas emitPvClotureIfDue), donc pas de verrou advisory
    // à respecter : l'invalidation préalable reste sûre.
    await signatureService.invalidateUnsignedTokens(id);
    if (signatureDataUrl) {
      await signatureService.saveItPvSignature(id, signatureDataUrl, signerEmail, userId);
    }
    const updatedBon = await prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });
    const sig = await signatureService.generateToken(id, 'restitution', userId, false);
    notificationService.sendRestitutionRequest(updatedBon, sig.token).catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));

    logger.log(
      `Bon ${updatedBon.reference} — tous les équipements retrouvés, passage en restitution`,
    );
  } else {
    // ── Still has not-returned items, nothing pending → PV de clôture ───
    // Pas d'invalidateUnsignedTokens ici (hors verrou) : un appel préalable
    // pourrait, en cas de course, invalider le token pv_cloture déjà
    // committé par une requête concurrente juste avant que son propre
    // contrôle d'idempotence ne le voie — emitPvClotureIfDue invalide déjà
    // les tokens d'un autre type DANS son verrou advisory.
    const emitted = await emitPvClotureIfDue(ctx, id, signatureDataUrl, userId);
    if (!emitted) {
      logger.warn(
        `Bon ${id} — PV clôture non émis après markFound (conditions non réunies ou déjà en attente)`,
      );
    }
  }

  return findBonOrThrow(prisma, id);
}
