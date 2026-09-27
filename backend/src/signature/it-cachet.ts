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
import { NON_SIGNABLE_BON_STATUSES, isBonStatusIn } from '../bons/bon-status';

/** Document d'une signature IT (`Signature.pdfType`) : le PDF qui la porte. */
export type ItSignatureDocument = 'mise_disposition' | 'restitution' | 'pv_cloture' | 'avenant';

/** Avant l'envoi de la remise, la signature IT est celle de la remise ;
 *  ensuite, celle de la restitution. */
export function itCachetDocument(
  requested: 'mise_disposition' | 'restitution' | undefined,
  bonStatus: string,
): 'mise_disposition' | 'restitution' {
  if (requested) return requested;
  return bonStatus === 'draft' || bonStatus === 'sent_mise_dispo' ? 'mise_disposition' : 'restitution';
}

/**
 * Document de la signature IT recueillie lors d'une déclaration de
 * non-restitution ou d'un équipement retrouvé : l'avenant si le bon est déjà
 * clôturé, sinon le PV de non-restitution. Une déclaration faite pendant
 * qu'une restitution attend sa signature signe le PV qui suivra : rangée sous
 * « restitution », elle prendrait la place de la signature IT de cette
 * restitution et laisserait la case IT du PV vide.
 */
export function pvContextDocument(bonStatus: string): ItSignatureDocument {
  return bonStatus === 'archived' ? 'avenant' : 'pv_cloture';
}

export interface ItCachetDeps {
  prisma: PrismaService;
  encryption: EncryptionService;
  logger: Logger;
  uploadsDir: string;
  pdfSnapshot: PdfSnapshotDeps;
}

/** Signature IT d'un document, apposée dans l'application par le technicien
 *  connecté (aucun lien). Son document est enregistré dans `pdfType`. */
export async function signItCachet(
  deps: ItCachetDeps,
  bonId: string,
  signatureDataUrl: string,
  signerEmail: string,
  signerIp: string,
  signerUserAgent: string,
  pdfType?: 'mise_disposition' | 'restitution',
) {
  const bon = await deps.prisma.bon.findUniqueOrThrow({
    where: { id: bonId },
    select: BON_FOR_SIGNATURE_SELECT,
  });
  const document = itCachetDocument(pdfType, bon.status);

  // Idempotence (double clic) : une signature IT de CE document, par CE
  // technicien, encore valable, apposée il y a moins de 10 s ET depuis la
  // dernière modification du bon, est renvoyée telle quelle. Sinon (autre
  // document, autre technicien, bon modifié ou nouvelle restitution marquée
  // entre-temps), c'est une nouvelle signature : renvoyer l'ancienne ferait
  // porter au document le mauvais signataire, ou la bloquerait comme périmée.
  const since = Math.max(Date.now() - 10_000, new Date(bon.updatedAt).getTime());
  const recentItCachet = await deps.prisma.signature.findFirst({
    where: {
      bonId,
      type: 'it_cachet',
      signed: true,
      pdfType: document,
      signerEmail,
      invalidatedAt: null,
      signedAt: { gte: new Date(since) },
    },
    orderBy: { signedAt: 'desc' },
  });
  if (recentItCachet) {
    deps.logger.warn(`Signature IT déjà apposée à l'instant pour le bon ${bonId} (${document}) : renvoyée telle quelle`);
    return { ok: true, bon: sanitizeBonForResponse(bon), signature: toSafeSignature(recentItCachet as unknown as Record<string, unknown>) };
  }

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
      // Une signature IT n'est pas une signature « au guichet » : elle est
      // apposée dans l'application par le technicien connecté (R-032).
      isInPerson: false,
      initiatedById: null,
      pdfType: document,
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
      isInPerson: false,
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
      details: { currentStatus: bon.status, document },
      ipAddress: signerIp,
      userAgent: signerUserAgent,
    },
  });

  deps.logger.log(`Bon ${bon.reference} — signature IT (${document}) par ${signerEmail}`);

  // Reload bon with fresh signatures list
  const updatedBon = await deps.prisma.bon.findUniqueOrThrow({
    where: { id: bonId },
    select: BON_FOR_SIGNATURE_SELECT,
  });

  // PDF du document avec la signature IT — attendu, rendu déterministe
  const itSnapshotType = document === 'restitution' ? 'signature_it_restitution' : 'signature_it_mise_disposition';
  try {
    await generatePdfSnapshot(deps.pdfSnapshot, updatedBon, itSnapshotType);
  } catch (err) {
    const message = (err as Error).message;
    deps.logger.error(`Échec du PDF de la signature IT (signature conservée): ${message}`);
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
 * Signature IT recueillie lors d'une déclaration de non-restitution ou d'un
 * équipement retrouvé. Son document (`pdfType`) est celui donné par
 * l'appelant, sinon déduit de l'état du bon (pvContextDocument) : c'est ce qui
 * permet au PDF de ce document d'afficher le bon technicien (R-030, C4).
 */
export async function saveItPvSignature(
  deps: Pick<ItCachetDeps, 'prisma' | 'encryption' | 'logger' | 'uploadsDir'>,
  bonId: string,
  signatureDataUrl: string,
  signerEmail: string,
  userId: string,
  pdfType?: ItSignatureDocument,
): Promise<void> {
  assertPngDataUrl(signatureDataUrl);
  const document =
    pdfType ??
    pvContextDocument((await deps.prisma.bon.findUniqueOrThrow({ where: { id: bonId }, select: { status: true } })).status);
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
      isInPerson: false,
      initiatedById: userId || null,
      pdfType: document,
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
      isInPerson: false,
      signedByProxy: false,
    }),
  );
  await deps.prisma.signature.update({
    where: { id: created.id },
    data: { seal, sealedAt: signedAt },
  });
}
