import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { AppConfigService } from '../config/config.service';
import { TimestampService } from './timestamp.service';
import { PdfService } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { SignatureEntry } from '../common/types';
import { generateToken as generateTokenImpl, invalidateUnsignedTokens as invalidateUnsignedTokensImpl } from './token-lifecycle';
import { getBonInfoByToken as getBonInfoByTokenImpl } from './bon-info';
import { getPreviewPdfByToken as getPreviewPdfByTokenImpl } from './preview-pdf';
import { sign as signImpl } from './signing';
import { signItCachet as signItCachetImpl, saveItPvSignature as saveItPvSignatureImpl } from './it-cachet';
import {
  getSignatureImageDecrypted as getSignatureImageDecryptedImpl,
  getSignatureImagesForBon as getSignatureImagesForBonImpl,
  SignatureFileStoreDeps,
} from './signature-file-store';
import { computeSignatureIntegrity } from './seal';
import { SIGNATURES_DIR } from '../common/storage-paths';

/**
 * Façade fine : chaque méthode publique délègue à un module pur/dédié sous
 * `signature/` (token-lifecycle, bon-info, preview-pdf, signing, it-cachet,
 * signature-file-store, seal). Aucun changement de comportement — le
 * découpage extrait uniquement l'implémentation, pas le contrat.
 *
 * BonsService reste résolu PARESSEUSEMENT via ModuleRef (jamais injecté au
 * constructeur, jamais importé autrement qu'en `import type`) : voir le
 * commentaire du constructeur ci-dessous et signing.ts.
 */
@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);
  private readonly UPLOADS_DIR = SIGNATURES_DIR;
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

  private get fileStoreDeps(): SignatureFileStoreDeps {
    return { encryption: this.encryption, uploadsDir: this.UPLOADS_DIR, logger: this.logger };
  }

  private get pdfSnapshotDeps() {
    return {
      pdfService: this.pdfService,
      smbService: this.smbService,
      logger: this.logger,
      fileStore: this.fileStoreDeps,
    };
  }

  /** Generate a signature token for a bon (mise_disposition, restitution, or pv_cloture). */
  async generateToken(
    bonId: string,
    type: 'mise_disposition' | 'restitution' | 'pv_cloture',
    initiatedById?: string,
    isInPerson = false,
  ) {
    return generateTokenImpl(
      {
        prisma: this.prisma,
        configService: this.configService,
        defaultTokenValidityDays: this.DEFAULT_TOKEN_VALIDITY_DAYS,
        inPersonTokenValidityHours: this.IN_PERSON_TOKEN_VALIDITY_HOURS,
      },
      bonId,
      type,
      initiatedById,
      isInPerson,
    );
  }

  /** Authenticated endpoint: get bon info from token. */
  async getBonInfoByToken(token: string, requesterEmail?: string, requesterId?: string) {
    return getBonInfoByTokenImpl({ prisma: this.prisma }, token, requesterEmail, requesterId);
  }

  /** Aperçu du document EXACT qui sera signé. */
  async getPreviewPdfByToken(
    token: string,
    requesterEmail?: string,
    requesterId?: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    return getPreviewPdfByTokenImpl(
      { prisma: this.prisma, pdfService: this.pdfService, fileStore: this.fileStoreDeps },
      token,
      requesterEmail,
      requesterId,
    );
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
    return signImpl(
      {
        prisma: this.prisma,
        encryption: this.encryption,
        timestampService: this.timestampService,
        moduleRef: this.moduleRef,
        logger: this.logger,
        uploadsDir: this.UPLOADS_DIR,
        pdfSnapshot: this.pdfSnapshotDeps,
      },
      token,
      signatureDataUrl,
      mentionLuApprouve,
      signerEmail,
      signerIp,
      signerUserAgent,
      signerId,
    );
  }

  /** Resolve decrypted SigImages for a list of signatures (used by BonsController for on-the-fly PDF) */
  async getSignatureImagesForBon(signatures: SignatureEntry[]) {
    return getSignatureImagesForBonImpl(this.fileStoreDeps, signatures);
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
    return signItCachetImpl(
      {
        prisma: this.prisma,
        encryption: this.encryption,
        logger: this.logger,
        uploadsDir: this.UPLOADS_DIR,
        pdfSnapshot: this.pdfSnapshotDeps,
      },
      bonId,
      signatureDataUrl,
      signerEmail,
      signerIp,
      signerUserAgent,
      pdfType,
    );
  }

  /** Get decrypted signature image for PDF generation */
  async getSignatureImageDecrypted(signatureImagePath: string): Promise<string | null> {
    return getSignatureImageDecryptedImpl(this.fileStoreDeps, signatureImagePath);
  }

  /**
   * Vérifie l'intégrité probante des signatures d'un bon : recalcule chaque
   * sceau HMAC et le compare à celui stocké.
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

    const { allValid, signatures } = computeSignatureIntegrity(sigs, anonymized, (expected, seal) =>
      this.encryption.verifySeal(expected, seal),
    );
    return { allValid, anonymized, signatures };
  }

  /** Invalidate all unsigned tokens for a bon (used when bon enters contested state) */
  async invalidateUnsignedTokens(bonId: string): Promise<void> {
    return invalidateUnsignedTokensImpl({ prisma: this.prisma }, bonId);
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
    return saveItPvSignatureImpl(
      { prisma: this.prisma, encryption: this.encryption, logger: this.logger, uploadsDir: this.UPLOADS_DIR },
      bonId,
      signatureDataUrl,
      signerEmail,
      userId,
    );
  }
}
