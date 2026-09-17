import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { AppConfigService } from '../config/config.service';
import { TimestampService } from './timestamp.service';
import { PdfService, SigImages, BonForPdf } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
// Import de TYPE uniquement (effacé à la compilation) : importer la classe
// formerait un cycle de fichiers avec bons.service.ts (cf. bons.tokens.ts).
import type { BonsService } from '../bons/bons.service';
import { BONS_SERVICE } from '../bons/bons.tokens';
import { BonStatus, SignatureEntry, BON_SELECT_SHAPE, sanitizeBonForResponse, toSafeSignature } from '../common/types';
import { generateSignatureToken } from '../common/tokens';
import { assertPngDataUrl } from '../common/signature-data-url';

// Internal query shape: no legacy Bytes columns (they used to be serialized
// into signature endpoint responses), but FULL signature records because PDF
// snapshot generation needs signatureImagePath. Responses must be passed
// through sanitizeBonForResponse() before leaving the service.
const BON_FOR_SIGNATURE_SELECT = {
  ...BON_SELECT_SHAPE.select,
  equipments: { orderBy: { order: 'asc' as const }, include: { catalogItem: true } },
  signatures: true,
} as const;

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);
  private readonly UPLOADS_DIR = path.join(process.cwd(), 'data', 'signatures');
  private readonly DEFAULT_TOKEN_VALIDITY_DAYS = 7;
  // Décision produit : un lien présentiel (signature recueillie en direct sur
  // tablette) est bien plus court-vécu qu'un lien envoyé par email — 2h suffisent
  // largement pour le rendez-vous et limitent la fenêtre d'exposition du token.
  private readonly IN_PERSON_TOKEN_VALIDITY_HOURS = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly configService: AppConfigService,
    private readonly timestampService: TimestampService,
    private readonly pdfService: PdfService,
    private readonly smbService: SmbService,
    // BonsService dépend déjà de SignatureService (envoi des tokens) ; injecter
    // BonsService ici en retour formerait un cycle de MODULES (BonsModule ↔
    // SignatureModule) qui casse le démarrage réel de l'app (cf.
    // src/__tests__/modules-boot.spec.ts). Le hook post-signature de
    // restitution (cf. sign()) résout donc BonsService PARESSEUSEMENT via
    // ModuleRef au moment de l'appel plutôt que par injection de constructeur.
    private readonly moduleRef: ModuleRef,
  ) {
    // Ensure signatures directory exists
    if (!fs.existsSync(this.UPLOADS_DIR)) {
      fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
    }
  }

  /**
   * Charge canonique scellée par HMAC : version + identité + champs probants.
   * Stable et ordonnée (toute modif d'un champ casse le sceau). Le scellement
   * du PDF lui-même est couvert ailleurs (SHA-256 du snapshot + ProofArchive) ;
   * ce sceau-ci protège l'intégrité de l'ENREGISTREMENT de signature en base.
   */
  private buildSealPayload(f: {
    bonId: string;
    signatureId: string;
    type: string;
    signerEmail: string | null;
    signedAt: Date;
    mentionLuApprouve: boolean;
    isInPerson: boolean;
    signedByProxy: boolean;
  }): string {
    return [
      'seal-v1',
      f.bonId,
      f.signatureId,
      f.type,
      (f.signerEmail ?? '').toLowerCase().trim(),
      f.signedAt.toISOString(),
      f.mentionLuApprouve ? '1' : '0',
      f.isInPerson ? '1' : '0',
      f.signedByProxy ? '1' : '0',
    ].join('|');
  }

  /** Horodatage RFC 3161 best-effort du sceau, persisté si la TSA répond. */
  private async applyTimestamp(signatureId: string, seal: string): Promise<void> {
    try {
      const sealHash = crypto.createHash('sha256').update(seal, 'utf8').digest('hex');
      const ts = await this.timestampService.timestamp(sealHash);
      if (!ts) return;
      await this.prisma.signature.update({
        where: { id: signatureId },
        data: { tsToken: ts.token, tsAuthority: ts.authority, tsAt: ts.at },
      });
    } catch (err) {
      this.logger.warn(`Horodatage non persisté (signature conservée): ${(err as Error).message}`);
    }
  }

  /** Token validity in days — admin-configurable (tokens.expiry_days), clamped to [1, 30]. */
  private async getTokenValidityDays(): Promise<number> {
    const raw = await this.configService.get('tokens', 'expiry_days');
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return this.DEFAULT_TOKEN_VALIDITY_DAYS;
    return Math.min(30, Math.max(1, parsed));
  }

  /**
   * Generate a signature token for a bon (mise_disposition, restitution, or pv_cloture).
   *
   * Contrat isInPerson (lot B) : quand isInPerson=true, la validité est fixée à
   * IN_PERSON_TOKEN_VALIDITY_HOURS (2h) — la validité configurable en jours
   * (tokens.expiry_days) ne s'applique qu'aux liens envoyés par email. Les
   * appelants existants (lot A2 inclus) n'ont rien à changer : le paramètre
   * isInPerson existait déjà, seul son effet sur l'expiration change.
   */
  async generateToken(
    bonId: string,
    type: 'mise_disposition' | 'restitution' | 'pv_cloture',
    initiatedById?: string,
    isInPerson = false,
  ) {
    // Invalidate previous unsigned tokens of same type
    await this.prisma.signature.updateMany({
      where: { bonId, type, signed: false },
      data: { tokenExpiresAt: new Date(0) }, // expire immediately
    });

    // 256 bits d'entropie (homogène avec les autres secrets du projet) plutôt
    // que les 122 bits d'un UUIDv4 — c'est le token réellement signable.
    const token = generateSignatureToken();
    const tokenExpiresAt = isInPerson
      ? new Date(Date.now() + this.IN_PERSON_TOKEN_VALIDITY_HOURS * 60 * 60 * 1000)
      : new Date(Date.now() + (await this.getTokenValidityDays()) * 24 * 60 * 60 * 1000);

    return this.prisma.signature.create({
      data: {
        bonId,
        type,
        token,
        tokenExpiresAt,
        isInPerson,
        initiatedById: initiatedById ?? null,
      },
    });
  }

  /** Authenticated endpoint: get bon info from token.
   *  Returns the full bon payload ONLY to the intended signer (or for in-person
   *  signatures) and only while the link is still pending — expired/signed
   *  links and other authenticated users get a minimal status response. */
  async getBonInfoByToken(token: string, requesterEmail?: string, requesterId?: string) {
    const sig = await this.prisma.signature.findUnique({
      where: { token },
      include: {
        bon: { select: BON_FOR_SIGNATURE_SELECT },
      },
    });

    if (!sig) throw new NotFoundException('Lien de signature invalide');

    // Contrôle destinataire AVANT toute donnée : un non-destinataire ne doit
    // pas pouvoir confirmer l'existence d'un bon ni récupérer sa référence,
    // même pour un lien expiré ou déjà signé (fail-closed, hors présentiel).
    // Comparaison par id EN PLUS de l'email : un changement d'adresse AD ne
    // doit pas priver le titulaire de son lien de signature.
    const isRecipient = this.isRecipient(sig.bon, sig.isInPerson, requesterEmail, requesterId);
    if (!isRecipient) {
      return { status: 'unauthorized' };
    }

    // Bon annulé/contesté : à traiter AVANT signed/expired pour que le frontend
    // affiche l'écran dédié plutôt qu'un simple "lien expiré/déjà signé".
    if (sig.bon.status === 'cancelled' || sig.bon.status === 'contested') {
      return { status: sig.bon.status as 'cancelled' | 'contested', reference: sig.bon.reference };
    }

    if (sig.signed) {
      return { status: 'already_signed', reference: sig.bon.reference, bonId: sig.bon.id };
    }

    if (new Date() > sig.tokenExpiresAt) {
      return { status: 'expired', reference: sig.bon.reference };
    }

    return {
      status: 'pending',
      bon: sanitizeBonForResponse(sig.bon),
      signature: toSafeSignature(sig as unknown as Record<string, unknown>),
    };
  }

  /**
   * Le destinataire légitime d'un lien de signature : le mode présentiel (tout
   * compte authentifié peut recueillir la signature — décision produit, pas de
   * restriction aux comptes IT), OU le titulaire du bon identifié par id (fiable
   * même après un changement d'adresse AD) OU par email (compat / trace).
   */
  private isRecipient(
    bon: { id: string; collaborateurId: string; collaborateurEmail: string },
    isInPerson: boolean,
    requesterEmail?: string,
    requesterId?: string,
  ): boolean {
    if (isInPerson) return true;
    if (requesterId && requesterId === bon.collaborateurId) return true;
    return bon.collaborateurEmail.toLowerCase().trim() === (requesterEmail ?? '').toLowerCase().trim();
  }

  /**
   * Aperçu du document EXACT qui sera signé (chaîne de preuve : le signataire
   * voit l'artefact final, pas seulement la page web). Mêmes contrôles d'accès
   * que getBonInfoByToken : token valide, non signé, destinataire uniquement
   * (sauf présentiel).
   */
  async getPreviewPdfByToken(
    token: string,
    requesterEmail?: string,
    requesterId?: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    const sig = await this.prisma.signature.findUnique({
      where: { token },
      include: { bon: { select: BON_FOR_SIGNATURE_SELECT } },
    });
    if (!sig) throw new NotFoundException('Lien de signature invalide');
    if (sig.signed) throw new BadRequestException('Ce document a déjà été signé');
    if (new Date() > sig.tokenExpiresAt) throw new BadRequestException('Ce lien de signature a expiré');
    if (!this.isRecipient(sig.bon, sig.isInPerson, requesterEmail, requesterId)) {
      throw new ForbiddenException('Ce document est destiné à un autre collaborateur');
    }

    const documentType =
      sig.type === 'pv_cloture' ? 'cloture' : sig.type === 'restitution' ? 'restitution' : 'mise_disposition';
    const sigImages = await this.getSignatureImagesForBon(sig.bon.signatures || []);
    sigImages.collab = null; // la signature du collaborateur n'existe pas encore

    const pdf = await this.pdfService.generateBonPdf(sig.bon, sigImages, documentType);
    return { pdf, filename: `apercu-${sig.bon.reference}.pdf` };
  }

  /** Sign a document — called after SSO auth with email verification */
  async sign(
    token: string,
    signatureDataUrl: string,
    mentionLuApprouve: boolean,
    signerEmail: string,
    signerIp: string,
    signerUserAgent: string,
    signerId?: string,
  ) {
    const sig = await this.prisma.signature.findUnique({
      where: { token },
      include: {
        bon: { select: BON_FOR_SIGNATURE_SELECT },
      },
    });

    if (!sig) throw new NotFoundException('Lien de signature invalide');
    if (sig.signed) throw new BadRequestException('Ce document a déjà été signé');
    if (new Date() > sig.tokenExpiresAt) throw new BadRequestException('Ce lien de signature a expiré');

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
    const signatureImagePath = await this.saveSignatureFile(
      sig.bon.id,
      sig.type,
      signatureDataUrl,
    );

    // Atomic transaction: update signature + bon status + audit log.
    // Everything is re-checked INSIDE the transaction: the pre-transaction reads
    // (including the file write above) leave a window during which the token can
    // be invalidated or the bon cancelled/contested — the stale values must not win.
    const runSignTransaction = () => this.prisma.$transaction(async (tx) => {
      const freshSig = await tx.signature.findUnique({
        where: { token },
        select: { signed: true, tokenExpiresAt: true, bon: { select: { status: true } } },
      });
      if (!freshSig || freshSig.signed) {
        throw new BadRequestException('Ce document a déjà été signé (concurrent)');
      }
      if (new Date() > freshSig.tokenExpiresAt) {
        throw new BadRequestException('Ce lien de signature a expiré');
      }
      if (['cancelled', 'contested', 'archived'].includes(freshSig.bon.status)) {
        throw new BadRequestException('Ce bon est clôturé, annulé ou contesté et ne peut plus être signé');
      }

      // Compute the transition from the FRESH status, not the pre-transaction one
      const txNewStatus = this.getNextBonStatus(freshSig.bon.status, sig.type);

      // Scellement probant : HMAC des champs au moment exact de la signature.
      const signedAt = new Date();
      const seal = this.encryption.seal(
        this.buildSealPayload({
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
      await unlink(path.join(this.UPLOADS_DIR, signatureImagePath)).catch((unlinkErr: unknown) =>
        this.logger.warn(
          `Échec suppression fichier signature orphelin ${signatureImagePath}: ${(unlinkErr as Error).message}`,
        ),
      );
      throw err;
    }
    const { updatedSig, updatedBon, newStatus, seal } = txResult;

    this.logger.log(
      `Bon ${sig.bon.reference} signé (${sig.type}) par ${signerEmail} — nouveau statut: ${newStatus}`,
    );

    // Horodatage RFC 3161 du sceau — best-effort, hors transaction (appel réseau).
    await this.applyTimestamp(updatedSig.id, seal);

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
      await this.generatePdfSnapshot(updatedBon, snapshotType);
    } catch (err) {
      // La signature est déjà committée et valide ; le snapshot est
      // régénérable à la demande (rendu déterministe, cf. lot E
      // regenerateMissingSnapshots). On trace l'échec en audit log (preuve
      // exploitable / alerting) sans faire échouer la réponse.
      const message = (err as Error).message;
      this.logger.error(`Échec génération snapshot PDF (signature conservée): ${message}`);
      await this.prisma.auditLog
        .create({
          data: {
            bonId: updatedBon.id,
            action: 'pdf_snapshot_failed',
            details: { type: snapshotType, error: message },
          },
        })
        .catch((auditErr: unknown) =>
          this.logger.error(`Échec écriture audit log pdf_snapshot_failed: ${(auditErr as Error).message}`),
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
        const bonsService = this.moduleRef.get<BonsService>(BONS_SERVICE, { strict: false });
        const emitted = await bonsService.emitPvClotureIfDue(updatedBon.id);
        if (!emitted) {
          this.logger.warn(
            `Bon ${sig.bon.reference} — PV clôture non émis après signature restitution (conditions non réunies ou déjà en attente)`,
          );
        }
      } catch (err) {
        // La signature reste valide même si le hook échoue — pas de PV cette
        // fois, mais rien n'est perdu (idempotent, ré-essayable via resend).
        this.logger.error(`Échec hook PV clôture après signature restitution: ${(err as Error).message}`);
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

  /** Génère et sauvegarde en DB le snapshot PDF au moment de la signature */
  private async generatePdfSnapshot(bon: BonForPdf, snapshotType: string): Promise<void> {
    const sigImages = await this.buildSigImagesForSnapshot(bon, snapshotType);
    const collabName = this.smbService.sanitizeName(bon.collaborateur?.displayName || 'INCONNU');
    const filename = `${bon.reference}_${collabName}_${snapshotType}.pdf`;
    const pdfBuffer = await this.pdfService.generateAndSave(bon, snapshotType, sigImages, filename);

    // Export to SMB share (fire & forget)
    this.smbService.exportPdf(bon, filename, pdfBuffer).catch((err) =>
      this.logger.error(`Échec export SMB: ${(err as Error).message}`),
    );
  }

  /** Build SigImages with only the relevant signatures for a given snapshot type */
  private async buildSigImagesForSnapshot(bon: BonForPdf, snapshotType: string): Promise<SigImages> {
    const sigImages: SigImages = { it: null, collab: null };
    const signatures = bon.signatures || [];

    for (const sig of signatures) {
      if (!sig.signed || !sig.signatureImagePath) continue;
      const raw = await this.getSignatureImageDecrypted(sig.signatureImagePath);
      if (!raw) continue;
      const src = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;

      if (sig.type === 'it_cachet') {
        sigImages.it = src;
      } else if (snapshotType === 'cloture_equipements_manquants') {
        // For PV cloture final snapshot (collab signed): use pv_cloture sig
        if (sig.type === 'pv_cloture') {
          sigImages.collab = src;
        }
      } else if (snapshotType.includes('collab')) {
        // For collab snapshots, include the collab signature matching the context
        const isRestitutionSnapshot = snapshotType.includes('restitution');
        const isRestitutionSig = sig.type === 'restitution';
        if (isRestitutionSnapshot === isRestitutionSig) {
          sigImages.collab = src;
        }
      }
      // For IT-only snapshots (signature_it_*), don't include collab signature
    }

    return sigImages;
  }

  /** Resolve decrypted SigImages for a list of signatures (used by BonsController for on-the-fly PDF) */
  async getSignatureImagesForBon(signatures: SignatureEntry[]): Promise<SigImages> {
    const sigImages: SigImages = { it: null, collab: null };
    for (const sig of signatures || []) {
      if (!sig.signed || !sig.signatureImagePath) continue;
      const raw = await this.getSignatureImageDecrypted(sig.signatureImagePath);
      if (!raw) continue;
      const src = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
      if (sig.type === 'it_cachet') {
        sigImages.it = src;
      } else {
        sigImages.collab = src;
      }
    }
    return sigImages;
  }

  /** IT technician signs directly in-app (authenticated — no email token needed) */
  async signItCachet(
    bonId: string,
    signatureDataUrl: string,
    signerEmail: string,
    signerIp: string,
    signerUserAgent: string,
    pdfType?: 'mise_disposition' | 'restitution',
  ) {
    // Idempotency: if a signed it_cachet exists created within the last 10 seconds, return it
    const recentItCachet = await this.prisma.signature.findFirst({
      where: {
        bonId,
        type: 'it_cachet',
        signed: true,
        signedAt: { gt: new Date(Date.now() - 10_000) },
      },
      orderBy: { signedAt: 'desc' },
    });

    if (recentItCachet) {
      this.logger.warn(`signItCachet idempotency hit for bon ${bonId} — returning existing record`);
      const existingBon = await this.prisma.bon.findUniqueOrThrow({
        where: { id: bonId },
        select: BON_FOR_SIGNATURE_SELECT,
      });
      return { ok: true, bon: sanitizeBonForResponse(existingBon), signature: toSafeSignature(recentItCachet as unknown as Record<string, unknown>) };
    }

    const bon = await this.prisma.bon.findUniqueOrThrow({
      where: { id: bonId },
      select: BON_FOR_SIGNATURE_SELECT,
    });

    // Liste blanche implicite : le cachet IT ne peut être apposé que sur un bon
    // qui a été envoyé au moins une fois (pas encore un brouillon) et qui n'est
    // pas déjà clôturé, annulé ou contesté.
    // Un brouillon est accepté : le flux « Envoyer » de l'interface appose le
    // cachet IT AVANT l'envoi (le PDF envoyé au collaborateur porte ainsi le
    // cachet). Seuls les bons clos ou contestés sont refusés.
    if (['cancelled', 'archived', 'contested'].includes(bon.status)) {
      throw new BadRequestException('Ce bon est clôturé ou contesté et ne peut plus être modifié');
    }

    assertPngDataUrl(signatureDataUrl);

    // Invalidate any existing unsigned it_cachet tokens
    await this.prisma.signature.updateMany({
      where: { bonId, type: 'it_cachet', signed: false },
      data: { tokenExpiresAt: new Date(0) },
    });

    // Save encrypted signature file
    const signatureImagePath = await this.saveSignatureFile(bonId, 'it_cachet', signatureDataUrl);

    // Create it_cachet signature record (already signed — no token exchange needed)
    const signedAt = new Date();
    const itSig = await this.prisma.signature.create({
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
    const itSeal = this.encryption.seal(
      this.buildSealPayload({
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
    await this.prisma.signature.update({
      where: { id: itSig.id },
      data: { seal: itSeal, sealedAt: signedAt },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        bonId,
        userEmail: signerEmail,
        action: 'signed_it_cachet',
        details: { currentStatus: bon.status },
        ipAddress: signerIp,
        userAgent: signerUserAgent,
      },
    });

    this.logger.log(`Bon ${bon.reference} — cachet IT signé par ${signerEmail}`);

    // Reload bon with fresh signatures list
    const updatedBon = await this.prisma.bon.findUniqueOrThrow({
      where: { id: bonId },
      select: BON_FOR_SIGNATURE_SELECT,
    });

    // Snapshot PDF avec le cachet IT — attendu (cf. sign()), rendu déterministe
    const isRestitution = pdfType === 'restitution' || ['sent_restitution', 'partially_returned'].includes(bon.status);
    const itSnapshotType = isRestitution ? 'signature_it_restitution' : 'signature_it_mise_disposition';
    try {
      await this.generatePdfSnapshot(updatedBon, itSnapshotType);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Échec snapshot PDF IT cachet (cachet conservé): ${message}`);
      await this.prisma.auditLog
        .create({
          data: { bonId, action: 'pdf_snapshot_failed', details: { type: itSnapshotType, error: message } },
        })
        .catch((auditErr: unknown) =>
          this.logger.error(`Échec écriture audit log pdf_snapshot_failed: ${(auditErr as Error).message}`),
        );
    }

    return { ok: true, bon: sanitizeBonForResponse(updatedBon), signature: toSafeSignature(itSig as unknown as Record<string, unknown>) };
  }

  /** Get decrypted signature image for PDF generation */
  async getSignatureImageDecrypted(signatureImagePath: string): Promise<string | null> {
    try {
      // Path traversal protection: reject directory traversal attempts
      const basename = path.basename(signatureImagePath);
      if (basename !== signatureImagePath || signatureImagePath.includes('..') || signatureImagePath.includes('/') || signatureImagePath.includes('\\')) {
        this.logger.warn(`Path traversal attempt blocked: ${signatureImagePath}`);
        return null;
      }
      const fullPath = path.join(this.UPLOADS_DIR, basename);
      // Verify resolved path stays within UPLOADS_DIR
      if (!fullPath.startsWith(this.UPLOADS_DIR)) return null;
      if (!fs.existsSync(fullPath)) return null;
      const encrypted = await readFile(fullPath, 'utf8');
      return this.encryption.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async saveSignatureFile(
    bonId: string,
    type: string,
    dataUrl: string,
  ): Promise<string> {
    assertPngDataUrl(dataUrl);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

    try {
      const encrypted = this.encryption.encrypt(base64);
      const filename = `${bonId}_${type}_${Date.now()}.enc`;
      const filepath = path.join(this.UPLOADS_DIR, filename);
      await writeFile(filepath, encrypted, 'utf8');
      return filename;
    } catch (err) {
      this.logger.error(`Échec sauvegarde signature (bon=${bonId}, type=${type}): ${(err as Error).message}`);
      throw new BadRequestException('Erreur lors de la sauvegarde de la signature');
    }
  }

  private getNextBonStatus(currentStatus: string, signatureType: string): BonStatus | string {
    // Validate transitions: only advance from expected states
    const validTransitions: Record<string, { from: string[]; to: string }> = {
      mise_disposition: { from: ['sent_mise_dispo'], to: 'active' },
      restitution: { from: ['sent_restitution'], to: 'archived' },
      pv_cloture: { from: ['partially_returned'], to: 'archived' },
    };

    const transition = validTransitions[signatureType];
    if (transition && transition.from.includes(currentStatus)) {
      return transition.to;
    }

    // Restitution partielle : le collaborateur signe mais des équipements restent en attente
    // → on reste en partially_returned pour permettre de traiter le reste
    if (signatureType === 'restitution' && currentStatus === 'partially_returned') {
      return 'partially_returned';
    }

    if (transition && !transition.from.includes(currentStatus)) {
      this.logger.warn(
        `Invalid status transition: ${currentStatus} → ${transition.to} via ${signatureType}. Keeping current status.`,
      );
    }

    return currentStatus;
  }

  /**
   * Vérifie l'intégrité probante des signatures d'un bon : recalcule chaque
   * sceau HMAC et le compare à celui stocké. Toute altération directe en base
   * (email, horodatage, mention…) casse le sceau → sealValid:false.
   */
  async verifyBonIntegrity(bonId: string): Promise<{
    allValid: boolean;
    anonymized: boolean;
    signatures: Array<{
      id: string;
      type: string;
      signed: boolean;
      sealed: boolean;
      sealValid: boolean | null;
      timestamped: boolean;
      timestampAuthority: string | null;
      signedAt: Date | null;
    }>;
  }> {
    const [bon, sigs] = await Promise.all([
      this.prisma.bon.findUnique({ where: { id: bonId }, select: { anonymizedAt: true } }),
      this.prisma.signature.findMany({
        where: { bonId, signed: true },
        orderBy: { signedAt: 'asc' },
      }),
    ]);

    // Un bon anonymisé (RGPD, cf. retention.service) a perdu les champs PII
    // (email…) qui entrent dans le sceau : celui-ci n'est alors plus
    // recalculable — ce n'est pas une altération, juste un état non vérifiable.
    const anonymized = !!bon?.anonymizedAt;

    const signatures = sigs.map((s) => {
      const sealed = !!s.seal;
      let sealValid: boolean | null = null;
      if (anonymized) {
        sealValid = null;
      } else if (sealed && s.signedAt) {
        const expected = this.buildSealPayload({
          bonId: s.bonId,
          signatureId: s.id,
          type: s.type,
          signerEmail: s.signerEmail,
          signedAt: s.signedAt,
          mentionLuApprouve: s.mentionLuApprouve,
          isInPerson: s.isInPerson,
          signedByProxy: s.signedByProxy,
        });
        sealValid = this.encryption.verifySeal(expected, s.seal as string);
      }
      return {
        id: s.id,
        type: s.type,
        signed: s.signed,
        sealed,
        sealValid,
        timestamped: !!s.tsToken,
        timestampAuthority: s.tsAuthority ?? null,
        signedAt: s.signedAt,
      };
    });

    // Valide si tout enregistrement scellé l'est correctement (les non scellés —
    // ex. signatures antérieures à cette version — ne rendent pas le bon invalide).
    // Un bon anonymisé n'est jamais marqué invalide : sealValid:null est "non
    // vérifiable", pas "faux".
    const allValid = anonymized || signatures.every((s) => s.sealValid !== false);
    return { allValid, anonymized, signatures };
  }

  /** Invalidate all unsigned tokens for a bon (used when bon enters contested state) */
  async invalidateUnsignedTokens(bonId: string): Promise<void> {
    await this.prisma.signature.updateMany({
      where: { bonId, signed: false, tokenExpiresAt: { gt: new Date(1000) } },
      data: { tokenExpiresAt: new Date(0) },
    });
  }

  /**
   * Save an IT signature for PV cloture context (called by BonsService).
   * Creates a signed it_cachet Signature record without the full signItCachet flow.
   */
  async saveItPvSignature(
    bonId: string,
    signatureDataUrl: string,
    signerEmail: string,
    userId: string,
  ): Promise<void> {
    assertPngDataUrl(signatureDataUrl);
    const signatureImagePath = await this.saveSignatureFile(bonId, 'it_cachet', signatureDataUrl);
    const signedAt = new Date();
    const created = await this.prisma.signature.create({
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
    const seal = this.encryption.seal(
      this.buildSealPayload({
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
    await this.prisma.signature.update({
      where: { id: created.id },
      data: { seal, sealedAt: signedAt },
    });
  }
}
