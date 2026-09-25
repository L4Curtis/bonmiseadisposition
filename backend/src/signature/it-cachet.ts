import { BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { sanitizeBonForResponse, toSafeSignature } from '../common/types';
import { assertPngDataUrl } from '../common/signature-data-url';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { buildSealPayload } from './seal';
import { saveSignatureFile } from './signature-file-store';
import { generatePdfSnapshot, PdfSnapshotDeps } from './pdf-snapshot';
import { NON_SIGNABLE_BON_STATUSES, RESTITUTION_PHASE_BON_STATUSES, isBonStatusIn } from '../bons/bon-status';

export interface ItCachetDeps {
  prisma: PrismaService;
  encryption: EncryptionService;
  logger: Logger;
  uploadsDir: string;
  pdfSnapshot: PdfSnapshotDeps;
}

/** IT technician signs directly in-app (authenticated — no email token needed).
 *  Extrait de SignatureService.signItCachet sans changement de comportement. */
export async function signItCachet(
  deps: ItCachetDeps,
  bonId: string,
  signatureDataUrl: string,
  signerEmail: string,
  signerIp: string,
  signerUserAgent: string,
  pdfType?: 'mise_disposition' | 'restitution',
) {
  // Idempotency: if a signed it_cachet exists created within the last 10 seconds, return it
  const recentItCachet = await deps.prisma.signature.findFirst({
    where: {
      bonId,
      type: 'it_cachet',
      signed: true,
      signedAt: { gt: new Date(Date.now() - 10_000) },
    },
    orderBy: { signedAt: 'desc' },
  });

  if (recentItCachet) {
    deps.logger.warn(`signItCachet idempotency hit for bon ${bonId} — returning existing record`);
    const existingBon = await deps.prisma.bon.findUniqueOrThrow({
      where: { id: bonId },
      select: BON_FOR_SIGNATURE_SELECT,
    });
    return { ok: true, bon: sanitizeBonForResponse(existingBon), signature: toSafeSignature(recentItCachet as unknown as Record<string, unknown>) };
  }

  const bon = await deps.prisma.bon.findUniqueOrThrow({
    where: { id: bonId },
    select: BON_FOR_SIGNATURE_SELECT,
  });

  // Liste blanche implicite : le cachet IT ne peut être apposé que sur un bon
  // qui a été envoyé au moins une fois (pas encore un brouillon) et qui n'est
  // pas déjà clôturé, annulé ou contesté.
  // Un brouillon est accepté : le flux « Envoyer » de l'interface appose le
  // cachet IT AVANT l'envoi (le PDF envoyé au collaborateur porte ainsi le
  // cachet). Seuls les bons clos ou contestés sont refusés.
  if (isBonStatusIn(bon.status, NON_SIGNABLE_BON_STATUSES)) {
    throw new BadRequestException('Ce bon est clôturé ou contesté et ne peut plus être modifié');
  }

  assertPngDataUrl(signatureDataUrl);

  // Invalidate any existing unsigned it_cachet tokens
  await deps.prisma.signature.updateMany({
    where: { bonId, type: 'it_cachet', signed: false },
    data: { tokenExpiresAt: new Date(0) },
  });

  // Save encrypted signature file
  const signatureImagePath = await saveSignatureFile(
    { encryption: deps.encryption, uploadsDir: deps.uploadsDir, logger: deps.logger },
    bonId,
    'it_cachet',
    signatureDataUrl,
  );

  // Create it_cachet signature record (already signed — no token exchange needed)
  const signedAt = new Date();
  const itSig = await deps.prisma.signature.create({
    data: {
      bonId,
      type: 'it_cachet',
      token: crypto.randomUUID(),
      tokenExpiresAt: new Date(0),
      signed: true,
      signatureImagePath,
      signedAt,
      signerEmail,
      signerIp,
      signerUserAgent,
      mentionLuApprouve: true,
      isInPerson: true,
      initiatedById: null,
      pdfType: pdfType ?? null,
    },
  });

  // Scellement HMAC (anti-altération en base). Pas d'appel TSA pour le cachet
  // interne : l'horodatage de confiance est réservé aux signatures liantes.
  const itSeal = deps.encryption.seal(
    buildSealPayload({
      bonId,
      signatureId: itSig.id,
      type: 'it_cachet',
      signerEmail,
      signedAt,
      mentionLuApprouve: true,
      isInPerson: true,
      signedByProxy: false,
    }),
  );
  await deps.prisma.signature.update({
    where: { id: itSig.id },
    data: { seal: itSeal, sealedAt: signedAt },
  });

  // Audit log
  await deps.prisma.auditLog.create({
    data: {
      bonId,
      userEmail: signerEmail,
      action: 'signed_it_cachet',
      details: { currentStatus: bon.status },
      ipAddress: signerIp,
      userAgent: signerUserAgent,
    },
  });

  deps.logger.log(`Bon ${bon.reference} — cachet IT signé par ${signerEmail}`);

  // Reload bon with fresh signatures list
  const updatedBon = await deps.prisma.bon.findUniqueOrThrow({
    where: { id: bonId },
    select: BON_FOR_SIGNATURE_SELECT,
  });

  // Snapshot PDF avec le cachet IT — attendu (cf. sign()), rendu déterministe
  const isRestitution = pdfType === 'restitution' || isBonStatusIn(bon.status, RESTITUTION_PHASE_BON_STATUSES);
  const itSnapshotType = isRestitution ? 'signature_it_restitution' : 'signature_it_mise_disposition';
  try {
    await generatePdfSnapshot(deps.pdfSnapshot, updatedBon, itSnapshotType);
  } catch (err) {
    const message = (err as Error).message;
    deps.logger.error(`Échec snapshot PDF IT cachet (cachet conservé): ${message}`);
    await deps.prisma.auditLog
      .create({
        data: { bonId, action: 'pdf_snapshot_failed', details: { type: itSnapshotType, error: message } },
      })
      .catch((auditErr: unknown) =>
        deps.logger.error(`Échec écriture audit log pdf_snapshot_failed: ${(auditErr as Error).message}`),
      );
  }

  return { ok: true, bon: sanitizeBonForResponse(updatedBon), signature: toSafeSignature(itSig as unknown as Record<string, unknown>) };
}

/**
 * Save an IT signature for PV cloture context (called by BonsService).
 * Creates a signed it_cachet Signature record without the full signItCachet flow.
 * Extrait de SignatureService.saveItPvSignature sans changement de comportement.
 */
export async function saveItPvSignature(
  deps: Pick<ItCachetDeps, 'prisma' | 'encryption' | 'logger' | 'uploadsDir'>,
  bonId: string,
  signatureDataUrl: string,
  signerEmail: string,
  userId: string,
): Promise<void> {
  assertPngDataUrl(signatureDataUrl);
  const signatureImagePath = await saveSignatureFile(
    { encryption: deps.encryption, uploadsDir: deps.uploadsDir, logger: deps.logger },
    bonId,
    'it_cachet',
    signatureDataUrl,
  );
  const signedAt = new Date();
  const created = await deps.prisma.signature.create({
    data: {
      bonId,
      type: 'it_cachet',
      token: crypto.randomUUID(),
      tokenExpiresAt: new Date(0),
      signed: true,
      signatureImagePath,
      signedAt,
      signerEmail,
      mentionLuApprouve: true,
      isInPerson: true,
      initiatedById: userId,
    },
  });
  const seal = deps.encryption.seal(
    buildSealPayload({
      bonId,
      signatureId: created.id,
      type: 'it_cachet',
      signerEmail,
      signedAt,
      mentionLuApprouve: true,
      isInPerson: true,
      signedByProxy: false,
    }),
  );
  await deps.prisma.signature.update({
    where: { id: created.id },
    data: { seal, sealedAt: signedAt },
  });
}
