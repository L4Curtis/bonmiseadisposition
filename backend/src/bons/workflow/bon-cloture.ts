import { BadRequestException, ConflictException } from '@nestjs/common';
import { BonStatus } from '../../common/types';
import { BON_REFERENCE_TX_OPTIONS } from '../../common/bon-reference';
import { assertPngDataUrl } from '../../common/signature-data-url';
import { generateSignatureToken } from '../../common/tokens';
import { BON_SELECT, findBonOrThrow } from '../queries/bon-where';
import { BonsWorkflowContext, generateAndSaveSnapshot, getPvTokenValidityDays } from './bon-context';

/**
 * Émet le procès-verbal de clôture (équipements non rendus) si — et
 * seulement si — le bon est réellement dans cet état : partially_returned,
 * aucun équipement encore en attente de restitution, et au moins un
 * équipement déclaré non rendu. Idempotent : un token pv_cloture non signé
 * et non expiré déjà en cours n'est jamais régénéré.
 *
 * Contrat public réutilisé par bons/workflow/bon-restitution.ts
 * (declareNotReturned), bons/workflow/bon-mark-found.ts (markFound),
 * bons/workflow/bon-resend.ts (resendSignatureLink) et exposé sur
 * BonsService pour signature.service (LOT B, via ModuleRef) : NE PAS
 * renommer / changer la signature sans coordination.
 *
 * Atomicité : le contrôle d'idempotence (aucun token pv_cloture en attente)
 * ET la création du token sont couverts par un verrou advisory Postgres
 * (pg_advisory_xact_lock, comme generateBonReference) posé DANS une même
 * transaction interactive — deux appels concurrents (double clic « Renvoyer »,
 * ou declareNotReturned + markFound quasi simultanés) ne peuvent donc plus
 * produire deux PV/emails/ProofArchive : le second voit le token fraîchement
 * créé par le premier dès que le verrou se libère et s'arrête là. Les tokens
 * en attente d'un AUTRE type sont également invalidés dans cette même
 * transaction (plus besoin qu'un appelant le fasse au préalable). Le
 * PDF/email restent émis après le commit (best-effort, non bloquants).
 *
 * @param bonId ID du bon.
 * @param itSignatureDataUrl Signature IT fraîche à persister (optionnelle) —
 *   si absente, la signature IT déjà en base (le cas échéant) est réutilisée.
 * @param actorId Utilisateur à l'origine de l'émission (technicien).
 * @returns true si le PV a été émis (PDF + token + email), false sinon.
 */
export async function emitPvClotureIfDue(
  ctx: BonsWorkflowContext,
  bonId: string,
  itSignatureDataUrl?: string,
  actorId?: string,
): Promise<boolean> {
  const { prisma, signatureService, notificationService, smbService, logger } = ctx;
  const bon = await prisma.bon.findUnique({ where: { id: bonId }, ...BON_SELECT });
  if (!bon || bon.status !== 'partially_returned') return false;

  const [pending, notReturnedCount] = await Promise.all([
    prisma.bonEquipment.count({ where: { bonId, returnedAt: null, notReturned: false } }),
    prisma.bonEquipment.count({ where: { bonId, notReturned: true } }),
  ]);
  if (pending > 0 || notReturnedCount === 0) return false;

  if (itSignatureDataUrl) {
    assertPngDataUrl(itSignatureDataUrl);
  }

  const validityDays = await getPvTokenValidityDays(ctx);

  const claimedToken = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pv_cloture:' || ${bonId}::text))`;

    // Idempotence (sous verrou) : un PV déjà en attente de co-signature
    // (token valide) ne doit pas être régénéré.
    const existingPvToken = await tx.signature.findFirst({
      where: { bonId, type: 'pv_cloture', signed: false, tokenExpiresAt: { gt: new Date() } },
    });
    if (existingPvToken) return null;

    // Tout token en attente d'un autre type (mise_disposition/restitution
    // résiduel) est invalidé avant l'émission du PV, dans la même
    // transaction que le verrou.
    await tx.signature.updateMany({
      where: { bonId, signed: false, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0) },
    });

    const token = generateSignatureToken();
    const tokenExpiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
    const created = await tx.signature.create({
      data: {
        bonId,
        type: 'pv_cloture',
        token,
        tokenExpiresAt,
        isInPerson: false,
        initiatedById: actorId ?? null,
      },
    });
    return created.token;
  }, BON_REFERENCE_TX_OPTIONS);

  if (!claimedToken) return false;

  if (itSignatureDataUrl) {
    const user = actorId
      ? await prisma.user.findUnique({ where: { id: actorId }, select: { email: true } })
      : null;
    await signatureService.saveItPvSignature(bonId, itSignatureDataUrl, user?.email ?? 'unknown', actorId ?? '');
  }

  // Signatures COMPLÈTES (signatureImagePath/signerIp/signerUserAgent) pour
  // un certificat de preuve exploitable dans le PDF (correction #5).
  const fullSignatures = await prisma.signature.findMany({ where: { bonId } });
  const sigImages = await signatureService.getSignatureImagesForBon(fullSignatures);
  // L'image IT fraîchement fournie prime sur celle relue depuis le disque
  // (évite un aller-retour chiffrement/déchiffrement inutile).
  if (itSignatureDataUrl) sigImages.it = itSignatureDataUrl;

  const collabName = smbService.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
  const filename = `${bon.reference}_${collabName}_cloture_equipements_manquants.pdf`;
  const bonForPdf = { ...bon, signatures: fullSignatures };
  const pdfBuffer = await generateAndSaveSnapshot(
    ctx,
    bonId,
    bonForPdf,
    'cloture_equipements_manquants',
    sigImages,
    filename,
  );
  if (pdfBuffer) {
    smbService.exportPdf(bon, filename, pdfBuffer).catch((err) =>
      logger.error(`Échec export SMB [${bon.reference}]: ${(err as Error).message}`),
    );
  }

  // Le token pv_cloture est déjà créé et commité (verrou advisory ci-dessus) :
  // l'email part même si le PDF a échoué (audité séparément ci-dessus).
  notificationService.sendPvClotureRequest(bon, claimedToken).catch((err: unknown) =>
    logger.error(`Email fire-and-forget: ${err}`),
  );

  await prisma.auditLog.create({
    data: { bonId, userId: actorId ?? null, action: 'pv_cloture_emitted', details: { notReturnedCount } },
  });

  logger.log(`Bon ${bon.reference} — PV clôture émis pour co-signature`);
  return true;
}

/**
 * Clôture unilatérale par l'IT (collaborateur injoignable, parti, ou silence
 * prolongé) : le bon avance sans signature collaborateur, avec motif
 * obligatoire, mention explicite sur le document PDF et traçage audit.
 * - sent_mise_dispo      → active   (remise constatée sans signature)
 * - sent_restitution     → archived (restitution constatée sans signature)
 * - partially_returned   → archived (PV constaté sans co-signature — exige
 *   que tous les équipements soient restitués ou déclarés non rendus)
 */
export async function closeUnilaterally(ctx: BonsWorkflowContext, id: string, userId: string, reason: string) {
  const { prisma, notificationService, smbService, signatureService, logger } = ctx;
  const bon = await findBonOrThrow(prisma, id);
  const allowed: BonStatus[] = ['sent_mise_dispo', 'sent_restitution', 'partially_returned'];
  if (!allowed.includes(bon.status as BonStatus)) {
    throw new BadRequestException(
      'La clôture unilatérale n\'est possible que sur un bon en attente de signature',
    );
  }

  if (bon.status === 'partially_returned') {
    const pending = await prisma.bonEquipment.count({
      where: { bonId: id, returnedAt: null, notReturned: false },
    });
    if (pending > 0) {
      throw new BadRequestException(
        'Des équipements ne sont ni restitués ni déclarés non rendus — traitez-les avant de clôturer',
      );
    }
  }

  const newStatus: BonStatus = bon.status === 'sent_mise_dispo' ? 'active' : 'archived';

  // Transition conditionnelle ET invalidation des tokens dans LA MÊME
  // transaction interactive : les faire dans deux allers-retours séparés
  // laissait une fenêtre où sign() — qui ne bloque que cancelled/contested/
  // archived et écrit sans re-vérifier la transition attendue — pouvait
  // aboutir sur un token pas encore invalidé entre le commit de la
  // transition et l'appel à invalidateUnsignedTokens.
  const transitionWon = await prisma.$transaction(async (tx) => {
    const transition = await tx.bon.updateMany({
      where: { id, status: bon.status as BonStatus },
      data: {
        status: newStatus,
        ...(newStatus === 'archived' ? { archivedAt: new Date() } : {}),
      },
    });
    if (transition.count === 0) return false;

    // Équivalent de signatureService.invalidateUnsignedTokens(id), inline
    // dans la transaction pour qu'il soit atomique avec la transition.
    await tx.signature.updateMany({
      where: { bonId: id, signed: false, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0) },
    });
    return true;
  });
  if (!transitionWon) {
    throw new ConflictException('Le statut du bon a changé entre-temps — rechargez la page');
  }

  const closer = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true },
  });
  await prisma.auditLog.create({
    data: {
      bonId: id,
      userId,
      action: 'bon_closed_unilateral',
      details: { from: bon.status, to: newStatus, reason },
    },
  });

  const updated = await prisma.bon.findUniqueOrThrow({ where: { id }, ...BON_SELECT });

  // Document de l'étape avec mention de clôture unilatérale dans la case de
  // signature collaborateur (le hash SHA-256 est tracé par generateAndSave)
  const note =
    `CLÔTURE UNILATÉRALE — constaté sans signature du collaborateur le ` +
    // timeZone explicite : sans elle, la date affichée dépend du fuseau du
    // serveur (LOT A2, simple ajout — la logique de clôture n'est pas touchée).
    `${new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} par ${closer?.displayName ?? 'le service IT'}. Motif : ${reason}`;
  const snapshotType =
    bon.status === 'sent_mise_dispo'
      ? 'signature_collab_mise_disposition'
      : bon.status === 'sent_restitution'
        ? 'signature_collab_restitution'
        : 'cloture_equipements_manquants';

  const fullSignatures = await prisma.signature.findMany({ where: { bonId: id } });
  const sigImages = await signatureService.getSignatureImagesForBon(fullSignatures);
  sigImages.collab = null; // pas de signature collaborateur, par définition

  const collabName = smbService.sanitizeName(updated.collaborateur?.displayName || 'INCONNU');
  const filename = `${updated.reference}_${collabName}_${snapshotType}_cloture_unilaterale.pdf`;
  // Les signatures complètes (avec signatureImagePath) sont nécessaires au
  // rendu PDF pour les dates de signature du cachet IT
  const bonForPdf = { ...updated, signatures: fullSignatures, _unilateralNote: note };

  // Persisté via generateAndSave (ProofArchive + PdfSnapshot « courant » +
  // audit du hash, lot E) : PdfSnapshotType n'a pas de valeur dédiée à la
  // clôture unilatérale (schema.prisma hors périmètre) — on réutilise le
  // type de l'étape d'origine (signature_collab_mise_disposition /
  // signature_collab_restitution / cloture_equipements_manquants).
  // Aucune perte de preuve possible : generateAndSave écrit d'abord une
  // NOUVELLE ligne ProofArchive (append-only — un éventuel document déjà
  // présent pour ce type, ex. le brouillon de PV émis par
  // emitPvClotureIfDue, reste archivé tel quel) avant de ne mettre à jour
  // que le pointeur PdfSnapshot « courant ». Seul le type
  // signature_collab_mise_disposition est protégé en dur côté pdf.service
  // (jamais réécrit une fois réellement signé) : ce cas ne peut pas se
  // produire ici, un bon encore en sent_mise_dispo n'ayant par construction
  // jamais reçu de signature collaborateur réelle.
  const pdfBuffer = await generateAndSaveSnapshot(ctx, id, bonForPdf, snapshotType, sigImages, filename);
  if (pdfBuffer) {
    smbService.exportPdf(updated, filename, pdfBuffer).catch((err) =>
      logger.error(`Échec export SMB [${updated.reference}]: ${(err as Error).message}`),
    );
  }

  // Informer le collaborateur (adresse peut-être désactivée — fire & forget)
  notificationService.sendUnilateralCloseNotice(updated, reason, newStatus).catch((err: unknown) => logger.error(`Email fire-and-forget: ${err}`));

  logger.log(`Bon ${updated.reference} clôturé unilatéralement (${bon.status} → ${newStatus}) par ${closer?.email}`);
  return findBonOrThrow(prisma, id);
}
