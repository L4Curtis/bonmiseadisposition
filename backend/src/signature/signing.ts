import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as crypto from 'crypto';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { TimestampService } from './timestamp.service';
// Import de TYPE uniquement (effacé à la compilation) : importer la classe
// formerait un cycle de fichiers avec bons.service.ts (cf. bons.tokens.ts).
import type { BonsService } from '../bons/bons.service';
import { BONS_SERVICE } from '../bons/bons.tokens';
import { BonStatus, sanitizeBonForResponse, toSafeSignature } from '../common/types';
import { assertPngDataUrl } from '../common/signature-data-url';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { expiredMessage } from './token';
import { buildSealPayload } from './seal';
import { getNextBonStatus } from './status-transition';
import { saveSignatureFile } from './signature-file-store';
import { generatePdfSnapshot, PdfSnapshotDeps } from './pdf-snapshot';

export interface SignDeps {
  prisma: PrismaService;
  encryption: EncryptionService;
  timestampService: TimestampService;
  moduleRef: ModuleRef;
  logger: Logger;
  uploadsDir: string;
  pdfSnapshot: PdfSnapshotDeps;
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

/** Sign a document — called after SSO auth with email verification.
 *  Extrait de SignatureService.sign() sans changement de comportement. */
export async function sign(
  deps: SignDeps,
  token: string,
  signatureDataUrl: string,
  mentionLuApprouve: boolean,
  signerEmail: string,
  signerIp: string,
  signerUserAgent: string,
  signerId?: string,
) {
  const sig = await deps.prisma.signature.findUnique({
    where: { token },
    include: {
      bon: { select: BON_FOR_SIGNATURE_SELECT },
    },
  });

  if (!sig) throw new NotFoundException('Lien de signature invalide');
  if (sig.signed) throw new BadRequestException('Ce document a déjà été signé');
  if (new Date() > sig.tokenExpiresAt) throw new BadRequestException(expiredMessage(sig.tokenExpiresAt));

  // Identité du signataire : par id (fiable après un changement d'adresse AD)
  // OU par email (compat / trace) — bon.collaborateurEmail reste inchangé et
  // sert de trace dans le PDF, elle n'est plus la SEULE source d'autorisation.
  const expectedEmail = sig.bon.collaborateurEmail.toLowerCase().trim();
  const actualEmail = signerEmail.toLowerCase().trim();
  const isOwner = (!!signerId && signerId === sig.bon.collaborateurId) || expectedEmail === actualEmail;
  if (!sig.isInPerson) {
    if (!isOwner) {
      throw new ForbiddenException(
        `Ce document est destiné à ${sig.bon.collaborateurEmail}, pas à ${signerEmail}`,
      );
    }
  }
  // Présentiel : si le compte connecté n'est pas le titulaire, c'est une
  // signature recueillie par un mandataire (technicien sur tablette) → tracé.
  // Décision produit : PAS de restriction aux comptes IT — tout compte
  // authentifié peut recueillir une signature présentielle.
  const signedByProxy = sig.isInPerson && !isOwner;

  if (!mentionLuApprouve) {
    throw new BadRequestException('Vous devez cocher "Lu et approuvé" pour signer');
  }

  // Validate PNG signature (préfixe, décodage base64, magic bytes, taille max)
  assertPngDataUrl(signatureDataUrl);

  // Save encrypted signature file (outside transaction — file system op)
  const signatureImagePath = await saveSignatureFile(
    { encryption: deps.encryption, uploadsDir: deps.uploadsDir, logger: deps.logger },
    sig.bon.id,
    sig.type,
    signatureDataUrl,
  );

  // Atomic transaction: update signature + bon status + audit log.
  // Everything is re-checked INSIDE the transaction: the pre-transaction reads
  // (including the file write above) leave a window during which the token can
  // be invalidated or the bon cancelled/contested — the stale values must not win.
  const runSignTransaction = () => deps.prisma.$transaction(async (tx) => {
    const freshSig = await tx.signature.findUnique({
      where: { token },
      select: { signed: true, tokenExpiresAt: true, bon: { select: { status: true } } },
    });
    if (!freshSig || freshSig.signed) {
      throw new BadRequestException('Ce document a déjà été signé (concurrent)');
    }
    if (new Date() > freshSig.tokenExpiresAt) {
      throw new BadRequestException(expiredMessage(freshSig.tokenExpiresAt));
    }
    if (['cancelled', 'contested', 'archived'].includes(freshSig.bon.status)) {
      throw new BadRequestException('Ce bon est clôturé, annulé ou contesté et ne peut plus être signé');
    }

    // Compute the transition from the FRESH status, not the pre-transaction one
    const txNewStatus = getNextBonStatus(freshSig.bon.status, sig.type, deps.logger);

    // Scellement probant : HMAC des champs au moment exact de la signature.
    const signedAt = new Date();
    const seal = deps.encryption.seal(
      buildSealPayload({
        bonId: sig.bon.id,
        signatureId: sig.id,
        type: sig.type,
        signerEmail,
        signedAt,
        mentionLuApprouve,
        isInPerson: sig.isInPerson,
        signedByProxy,
      }),
    );

    const txUpdatedSig = await tx.signature.update({
      where: { token },
      data: {
        signed: true,
        signatureImagePath,
        signedAt,
        signerEmail,
        signerIp,
        signerUserAgent,
        mentionLuApprouve,
        signedByProxy,
        seal,
        sealedAt: signedAt,
        // D03 : persister le type de document pour les requêtes de reporting
        // et de filtrage (cachet IT, PDF d'aperçu multi-type) qui s'appuient
        // sur pdfType plutôt que sur le champ type (plus générique).
        pdfType: sig.type,
      },
    });

    // updateMany conditionné sur le statut lu à l'instant (freshSig.bon.status)
    // plutôt qu'un update inconditionnel : si le bon a été annulé/clôturé/
    // contesté par une AUTRE transaction entre la lecture ci-dessus et cet
    // update (fenêtre de la transaction), count===0 et on échoue proprement
    // au lieu d'écraser silencieusement ce changement concurrent.
    const statusUpdate = await tx.bon.updateMany({
      where: { id: sig.bon.id, status: freshSig.bon.status },
      data: {
        status: txNewStatus as BonStatus,
        // Horodatage d'archivage (lot H) : posé au moment exact où le bon
        // bascule réellement en archived (restitution complète ou PV
        // co-signé) — jamais réécrit ensuite.
        ...(txNewStatus === 'archived' ? { archivedAt: new Date() } : {}),
      },
    });
    if (statusUpdate.count === 0) {
      throw new ConflictException('Le statut du bon a changé entre-temps, veuillez réessayer');
    }
    const txUpdatedBon = await tx.bon.findUniqueOrThrow({
      where: { id: sig.bon.id },
      select: BON_FOR_SIGNATURE_SELECT,
    });

    await tx.auditLog.create({
      data: {
        bonId: sig.bon.id,
        userEmail: signerEmail,
        action: `signed_${sig.type}`,
        details: {
          isInPerson: sig.isInPerson,
          signedByProxy,
          titulaireEmail: sig.bon.collaborateurEmail,
          mentionLuApprouve,
          newStatus: txNewStatus,
        },
        ipAddress: signerIp,
        userAgent: signerUserAgent,
      },
    });

    return { updatedSig: txUpdatedSig, updatedBon: txUpdatedBon, newStatus: txNewStatus, seal };
  });

  let txResult: Awaited<ReturnType<typeof runSignTransaction>>;
  try {
    txResult = await runSignTransaction();
  } catch (err) {
    // Le fichier .enc a été écrit AVANT la transaction (contrainte fs) : si
    // celle-ci échoue (concurrence, bon annulé/contesté entre-temps…), il ne
    // faut pas laisser une preuve orpheline, non référencée par aucune
    // signature, traîner sur le disque. Best-effort : un échec de suppression
    // n'a pas besoin de faire échouer la réponse (déjà en erreur).
    await unlink(path.join(deps.uploadsDir, signatureImagePath)).catch((unlinkErr: unknown) =>
      deps.logger.warn(
        `Échec suppression fichier signature orphelin ${signatureImagePath}: ${(unlinkErr as Error).message}`,
      ),
    );
    throw err;
  }
  const { updatedSig, updatedBon, newStatus, seal } = txResult;

  deps.logger.log(
    `Bon ${sig.bon.reference} signé (${sig.type}) par ${signerEmail} — nouveau statut: ${newStatus}`,
  );

  // Horodatage RFC 3161 du sceau — best-effort, hors transaction (appel réseau).
  await applyTimestamp(deps, updatedSig.id, seal);

  // Génération du snapshot PDF de preuve + SHA-256 — ATTENDUE (plus de fire &
  // forget) : une signature ne doit pas être confirmée sans que son document
  // probant et son empreinte existent. Le rendu est purement CPU/déterministe
  // (aucune dépendance réseau), donc awaiter ne pénalise pas notablement.
  const snapshotType = sig.type === 'restitution'
    ? 'signature_collab_restitution'
    : sig.type === 'pv_cloture'
    ? 'cloture_equipements_manquants'
    : 'signature_collab_mise_disposition';
  try {
    await generatePdfSnapshot(deps.pdfSnapshot, updatedBon, snapshotType);
  } catch (err) {
    // La signature est déjà committée et valide ; le snapshot est
    // régénérable à la demande (rendu déterministe, cf. lot E
    // regenerateMissingSnapshots). On trace l'échec en audit log (preuve
    // exploitable / alerting) sans faire échouer la réponse.
    const message = (err as Error).message;
    deps.logger.error(`Échec génération snapshot PDF (signature conservée): ${message}`);
    await deps.prisma.auditLog
      .create({
        data: {
          bonId: updatedBon.id,
          action: 'pdf_snapshot_failed',
          details: { type: snapshotType, error: message },
        },
      })
      .catch((auditErr: unknown) =>
        deps.logger.error(`Échec écriture audit log pdf_snapshot_failed: ${(auditErr as Error).message}`),
      );
  }

  // Hook PV de clôture : une signature de restitution qui laisse le bon en
  // partially_returned signifie que le collaborateur vient de co-signer ce
  // qu'il a rendu alors que d'autres équipements sont déjà déclarés non
  // rendus — c'est le moment de vérifier si le PV de clôture peut être émis
  // (emitPvClotureIfDue est idempotent et re-vérifie toutes les conditions).
  if (sig.type === 'restitution' && newStatus === 'partially_returned') {
    try {
      // Résolution paresseuse : BonsService n'est pas injecté au constructeur
      // (ça formerait un cycle de modules, cf. commentaire du constructeur) —
      // { strict: false } cherche dans tout le conteneur, pas seulement les
      // providers visibles depuis SignatureModule.
      const bonsService = deps.moduleRef.get<BonsService>(BONS_SERVICE, { strict: false });
      const emitted = await bonsService.emitPvClotureIfDue(updatedBon.id);
      if (!emitted) {
        deps.logger.warn(
          `Bon ${sig.bon.reference} — PV clôture non émis après signature restitution (conditions non réunies ou déjà en attente)`,
        );
      }
    } catch (err) {
      // La signature reste valide même si le hook échoue — pas de PV cette
      // fois, mais rien n'est perdu (idempotent, ré-essayable via resend).
      deps.logger.error(`Échec hook PV clôture après signature restitution: ${(err as Error).message}`);
    }
  }

  // Sanitize before returning: full signature records (with image paths and
  // tokens) are for internal PDF generation only. bonId/signedByProxy ajoutés
  // ici (pas par le contrôleur) : c'est le service qui connaît le contrat de
  // réponse attendu par le frontend (retour à la fiche du bon, mandataire).
  const safeSignature = {
    ...toSafeSignature(updatedSig as unknown as Record<string, unknown>),
    bonId: updatedBon.id,
    signedByProxy: updatedSig.signedByProxy,
  };
  return { signature: safeSignature, bon: sanitizeBonForResponse(updatedBon) };
}
