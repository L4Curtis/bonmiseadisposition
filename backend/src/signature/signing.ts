import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import type { BonStatus, Prisma, Signature } from '@prisma/client';
import * as crypto from 'crypto';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { TimestampService } from './timestamp.service';
import { sanitizeBonForResponse, toSafeSignature } from '../common/types';
import { assertPngDataUrl } from '../common/signature-data-url';
import { DOMAIN_EVENTS, DomainEventsPublisher, LinkDocumentType } from '../common/events';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { NOT_RECIPIENT_MESSAGE } from './recipient';
import { EXPIRED_LINK_MESSAGE, isReplacedToken, unusableLinkMessage } from './token';
import { effectiveInvalidationReason } from './link-invalidation';
import { buildSealPayload } from './seal';
import { getNextBonStatus } from './status-transition';
import { saveSignatureFile } from './signature-file-store';
import { generatePdfSnapshot, PdfSnapshotDeps } from './pdf-snapshot';
import { LINK_INVALIDATION_MESSAGES, NON_SIGNABLE_BON_STATUSES, isBonStatusIn } from '../bons/bon-status';

export interface SignDeps {
  prisma: PrismaService;
  encryption: EncryptionService;
  timestampService: TimestampService;
  events: Pick<DomainEventsPublisher, 'publish'>;
  logger: Logger;
  uploadsDir: string;
  pdfSnapshot: PdfSnapshotDeps;
}

/** Qui signe, d'où, et avec quelle mention. */
export interface SignerInput {
  signatureDataUrl: string;
  mentionLuApprouve: boolean;
  signerEmail: string;
  signerIp: string;
  signerUserAgent: string;
  signerId?: string;
}

/** Document signé par le collaborateur → type du PDF enregistré. */
const COLLAB_SNAPSHOT_TYPES: Readonly<Record<LinkDocumentType, string>> = Object.freeze({
  mise_disposition: 'signature_collab_mise_disposition',
  restitution: 'signature_collab_restitution',
  pv_cloture: 'cloture_equipements_manquants',
});

type SignableSignature = Signature & { bon: Awaited<ReturnType<typeof loadBonForSignature>> };

function loadBonForSignature(prisma: PrismaService, bonId: string) {
  return prisma.bon.findUniqueOrThrow({ where: { id: bonId }, select: BON_FOR_SIGNATURE_SELECT });
}

/** Horodatage RFC 3161 best-effort du sceau, persisté si la TSA répond. */
async function applyTimestamp(deps: SignDeps, signatureId: string, seal: string): Promise<void> {
  try {
    const sealHash = crypto.createHash('sha256').update(seal, 'utf8').digest('hex');
    const ts = await deps.timestampService.timestamp(sealHash);
    if (!ts) return;
    await deps.prisma.signature.update({
      where: { id: signatureId },
      data: { tsToken: ts.token, tsAuthority: ts.authority, tsAt: ts.at },
    });
  } catch (err) {
    deps.logger.warn(`Horodatage non persisté (signature conservée): ${(err as Error).message}`);
  }
}

/** Le lien existe, n'est pas signé, n'est ni expiré ni invalidé. */
async function loadSignableSignature(deps: SignDeps, token: string) {
  const sig = await deps.prisma.signature.findUnique({
    where: { token },
    include: { bon: { select: BON_FOR_SIGNATURE_SELECT } },
  });
  if (!sig) throw new NotFoundException('Lien de signature invalide');
  if (sig.signed) throw new BadRequestException('Ce document a déjà été signé');
  if (new Date() > sig.tokenExpiresAt) throw new BadRequestException(unusableLinkMessage(sig, sig.bon.status));
  return sig as SignableSignature;
}

/**
 * Le signataire est le titulaire (par identifiant, fiable après un changement
 * d'adresse, ou par adresse). Au guichet, tout compte connecté peut recueillir
 * la signature : c'est alors un mandataire, tracé (`signedByProxy`).
 */
function resolveSigner(sig: SignableSignature, signer: SignerInput): { signedByProxy: boolean } {
  const expectedEmail = sig.bon.collaborateurEmail?.toLowerCase().trim() ?? null;
  const actualEmail = signer.signerEmail.toLowerCase().trim();
  const isOwner =
    (!!signer.signerId && signer.signerId === sig.bon.collaborateurId) ||
    (expectedEmail !== null && expectedEmail === actualEmail);
  if (!sig.isInPerson && !isOwner) throw new ForbiddenException(NOT_RECIPIENT_MESSAGE);
  if (!signer.mentionLuApprouve) {
    throw new BadRequestException('Vous devez cocher "Lu et approuvé" pour signer');
  }
  assertPngDataUrl(signer.signatureDataUrl);
  return { signedByProxy: sig.isInPerson && !isOwner };
}

/** Début du message d'un lien devenu inutilisable pendant la signature. */
export const LINK_NO_LONGER_VALID_MESSAGE = "Ce lien n'est plus valide.";

/** Ce que la signature écrit sur le lien. */
type SignatureWrite = Pick<
  Signature,
  | 'signed' | 'signatureImagePath' | 'signedAt' | 'signerEmail' | 'signerIp' | 'signerUserAgent'
  | 'mentionLuApprouve' | 'signedByProxy' | 'seal' | 'sealedAt' | 'pdfType'
>;

/** Pourquoi l'écriture conditionnelle n'a touché aucune ligne : signé entre-
 *  temps, invalidé (avec son motif), ou expiré. */
async function linkNoLongerValidMessage(tx: Prisma.TransactionClient, token: string): Promise<string> {
  const row = await tx.signature.findUnique({
    where: { token },
    select: { signed: true, tokenExpiresAt: true, invalidatedReason: true, bon: { select: { status: true } } },
  });
  if (!row) return LINK_NO_LONGER_VALID_MESSAGE;
  if (row.signed) return 'Ce document a déjà été signé (concurrent)';
  if (row.invalidatedReason === null && !isReplacedToken(row.tokenExpiresAt)) return EXPIRED_LINK_MESSAGE;
  const reason = effectiveInvalidationReason(row.invalidatedReason, row.bon.status);
  return `${LINK_NO_LONGER_VALID_MESSAGE} ${LINK_INVALIDATION_MESSAGES[reason]}`;
}

/**
 * Écrit la signature SEULEMENT si le lien est encore utilisable à l'instant
 * de l'écriture : ni signé, ni invalidé, ni expiré. La relecture de la
 * transaction ne pose aucun verrou ; entre elle et cette écriture, une
 * modification du bon ou l'annulation d'un marquage a pu invalider le lien et
 * se valider. Sans cette condition, la signature porterait sur un document
 * différent de celui que le collaborateur a lu. Dans ce cas : 400, la
 * transaction est annulée et le bon n'avance pas.
 */
async function writeSignatureIfLinkStillValid(
  tx: Prisma.TransactionClient,
  sig: SignableSignature,
  data: SignatureWrite,
): Promise<Signature> {
  const { count } = await tx.signature.updateMany({
    where: { token: sig.token, signed: false, invalidatedAt: null, tokenExpiresAt: { gt: new Date() } },
    data,
  });
  if (count === 0) throw new BadRequestException(await linkNoLongerValidMessage(tx, sig.token));
  // La condition garantit que seule cette écriture a changé la ligne relue.
  const { bon: _bon, ...row } = sig;
  return { ...row, ...data };
}

interface SignedRecord {
  updatedSig: Signature;
  previousStatus: BonStatus;
  newStatus: BonStatus;
  seal: string;
}

/**
 * Transaction atomique : signature + statut + audit. Tout est relu DANS la
 * transaction : entre les lectures préalables (et l'écriture du fichier) et
 * ici, le lien a pu être invalidé ou le bon annulé/contesté. Les deux
 * écritures sont en plus conditionnelles (lien encore valide, statut
 * inchangé) : un geste concurrent validé après la relecture fait échouer.
 */
function runSignTransaction(
  deps: SignDeps,
  sig: SignableSignature,
  signer: SignerInput,
  signedByProxy: boolean,
  signatureImagePath: string,
): Promise<SignedRecord> {
  return deps.prisma.$transaction(async (tx) => {
    const fresh = await tx.signature.findUnique({
      where: { token: sig.token },
      select: { signed: true, tokenExpiresAt: true, invalidatedReason: true, bon: { select: { status: true } } },
    });
    if (!fresh || fresh.signed) throw new BadRequestException('Ce document a déjà été signé (concurrent)');
    if (new Date() > fresh.tokenExpiresAt) throw new BadRequestException(unusableLinkMessage(fresh, fresh.bon.status));
    if (isBonStatusIn(fresh.bon.status, NON_SIGNABLE_BON_STATUSES)) {
      throw new BadRequestException('Ce bon est clôturé, annulé ou contesté et ne peut plus être signé');
    }

    // Transition calculée sur le statut FRAIS ; les équipements non restitués
    // sont comptés dans la transaction (une déclaration concurrente compte).
    const notReturnedCount = await tx.bonEquipment.count({ where: { bonId: sig.bon.id, notReturned: true } });
    const newStatus = getNextBonStatus(fresh.bon.status, sig.type, deps.logger, notReturnedCount > 0) as BonStatus;

    // Scellement probant : HMAC des champs au moment exact de la signature.
    const signedAt = new Date();
    const seal = deps.encryption.seal(buildSealPayload({
      bonId: sig.bon.id, signatureId: sig.id, type: sig.type, signerEmail: signer.signerEmail, signedAt,
      mentionLuApprouve: signer.mentionLuApprouve, isInPerson: sig.isInPerson, signedByProxy,
    }));

    const updatedSig = await writeSignatureIfLinkStillValid(tx, sig, {
      signed: true, signatureImagePath, signedAt, signerEmail: signer.signerEmail, signerIp: signer.signerIp,
      signerUserAgent: signer.signerUserAgent, mentionLuApprouve: signer.mentionLuApprouve, signedByProxy,
      seal, sealedAt: signedAt, pdfType: sig.type,
    });

    // Conditionné sur le statut lu à l'instant : un changement concurrent
    // (annulation, clôture, contestation) fait échouer proprement.
    const statusUpdate = await tx.bon.updateMany({
      where: { id: sig.bon.id, status: fresh.bon.status },
      data: { status: newStatus, ...(newStatus === 'archived' ? { archivedAt: signedAt } : {}) },
    });
    if (statusUpdate.count === 0) throw new ConflictException('Le statut du bon a changé entre-temps, veuillez réessayer');

    await tx.auditLog.create({
      data: {
        bonId: sig.bon.id, userEmail: signer.signerEmail, action: `signed_${sig.type}`, ipAddress: signer.signerIp,
        userAgent: signer.signerUserAgent,
        details: {
          isInPerson: sig.isInPerson, signedByProxy, titulaireEmail: sig.bon.collaborateurEmail,
          mentionLuApprouve: signer.mentionLuApprouve, newStatus,
        },
      },
    });
    return { updatedSig, previousStatus: fresh.bon.status, newStatus, seal };
  });
}

/** Le fichier .enc est écrit AVANT la transaction : si elle échoue, il ne
 *  doit pas rester une preuve orpheline sur le disque (best-effort). */
async function removeOrphanFile(deps: SignDeps, signatureImagePath: string): Promise<void> {
  await unlink(path.join(deps.uploadsDir, signatureImagePath)).catch((err: unknown) =>
    deps.logger.warn(`Échec suppression fichier signature orphelin ${signatureImagePath}: ${(err as Error).message}`),
  );
}

/**
 * Document probant de la signature, ATTENDU : une signature n'est pas
 * confirmée sans son PDF et son empreinte. En cas d'échec, la signature reste
 * valide (déjà validée) et l'échec est tracé ; le PDF est régénérable.
 */
async function saveSignedDocument(deps: SignDeps, bon: Awaited<ReturnType<typeof loadBonForSignature>>, type: LinkDocumentType) {
  const snapshotType = COLLAB_SNAPSHOT_TYPES[type];
  try {
    await generatePdfSnapshot(deps.pdfSnapshot, bon, snapshotType);
  } catch (err) {
    const message = (err as Error).message;
    deps.logger.error(`Échec génération snapshot PDF (signature conservée): ${message}`);
    await deps.prisma.auditLog
      .create({ data: { bonId: bon.id, action: 'pdf_snapshot_failed', details: { type: snapshotType, error: message } } })
      .catch((auditErr: unknown) =>
        deps.logger.error(`Échec écriture audit log pdf_snapshot_failed: ${(auditErr as Error).message}`),
      );
  }
}

/**
 * Signature d'un document par son lien (à distance, ou au guichet). Après la
 * validation : horodatage, PDF probant, puis l'événement `signature.signed`,
 * auquel réagissent la suite du cycle de vie (émission du PV, lot 2A) et
 * l'email de confirmation (NotificationModule).
 */
export async function sign(deps: SignDeps, token: string, signer: SignerInput) {
  const sig = await loadSignableSignature(deps, token);
  const { signedByProxy } = resolveSigner(sig, signer);
  const documentType = sig.type as LinkDocumentType;

  const signatureImagePath = await saveSignatureFile(
    { encryption: deps.encryption, uploadsDir: deps.uploadsDir, logger: deps.logger },
    sig.bon.id,
    sig.type,
    signer.signatureDataUrl,
  );
  let record: SignedRecord;
  try {
    record = await runSignTransaction(deps, sig, signer, signedByProxy, signatureImagePath);
  } catch (err) {
    await removeOrphanFile(deps, signatureImagePath);
    throw err;
  }
  const { updatedSig, previousStatus, newStatus, seal } = record;
  deps.logger.log(`Bon ${sig.bon.reference} signé (${sig.type}) par ${signer.signerEmail} — nouveau statut: ${newStatus}`);

  await applyTimestamp(deps, updatedSig.id, seal);
  const updatedBon = await loadBonForSignature(deps.prisma, sig.bon.id);
  await saveSignedDocument(deps, updatedBon, documentType);

  await deps.events.publish(DOMAIN_EVENTS.signatureSigned, {
    bonId: sig.bon.id,
    bonReference: sig.bon.reference,
    actorId: signedByProxy ? signer.signerId ?? null : null,
    occurredAt: updatedSig.signedAt ?? new Date(),
    signatureId: updatedSig.id,
    documentType,
    previousStatus,
    newStatus,
    signerEmail: signer.signerEmail,
    inPerson: sig.isInPerson,
    signedByProxy,
  });

  // Réponse sans jeton ni chemin d'image (réservés au PDF interne).
  const safeSignature = {
    ...toSafeSignature(updatedSig as unknown as Record<string, unknown>),
    bonId: updatedBon.id,
    signedByProxy: updatedSig.signedByProxy,
  };
  return { signature: safeSignature, bon: sanitizeBonForResponse(updatedBon) };
}
