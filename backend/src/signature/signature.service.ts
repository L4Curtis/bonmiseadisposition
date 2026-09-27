import { Injectable, Logger } from '@nestjs/common';
import type { SignatureInvalidationReason } from '@prisma/client';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { AppConfigService } from '../config/config.service';
import { TimestampService } from './timestamp.service';
import { PdfService } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { NotificationService } from '../notification/notification.service';
import { LinkRequestResult, requestNewLink as requestNewLinkImpl } from './link-request';
import { SignatureEntry } from '../common/types';
import { DomainEventsPublisher } from '../common/events';
import {
  LinkDocumentType,
  generateToken as generateTokenImpl,
  invalidateUnsignedTokens as invalidateUnsignedTokensImpl,
} from './token-lifecycle';
import { getBonInfoByToken as getBonInfoByTokenImpl } from './bon-info';
import { getPreviewPdfByToken as getPreviewPdfByTokenImpl } from './preview-pdf';
import { SignerInput, sign as signImpl } from './signing';
import {
  ItSignatureDocument,
  signItCachet as signItCachetImpl,
  saveItPvSignature as saveItPvSignatureImpl,
} from './it-cachet';
import {
  getSignatureImageDecrypted as getSignatureImageDecryptedImpl,
  getSignatureImagesForBon as getSignatureImagesForBonImpl,
  SignatureFileStoreDeps,
} from './signature-file-store';
import { computeSignatureIntegrity } from './seal';
import { SIGNATURES_DIR } from '../common/storage-paths';

/**
 * Façade fine : chaque méthode publique délègue à un module dédié sous
 * `signature/` (token-lifecycle, bon-info, preview-pdf, signing, it-cachet,
 * signature-file-store, seal).
 *
 * La signature ne connaît pas le module des bons : elle annonce
 * `signature.signed` (common/events), et la suite du cycle de vie y réagit.
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
    private readonly events: DomainEventsPublisher,
    private readonly notificationService: NotificationService,
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
    return { pdfService: this.pdfService, smbService: this.smbService, logger: this.logger };
  }

  /** Lien de signature d'un document (remise, restitution ou PV), par email
   *  ou au guichet (`isInPerson`, 2 h) ; les liens vivants du même document
   *  sont invalidés avec leur motif. */
  async generateToken(
    bonId: string,
    type: LinkDocumentType,
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
      { prisma: this.prisma, pdfService: this.pdfService },
      token,
      requesterEmail,
      requesterId,
    );
  }

  /** Lien expiré : prévient l'équipe informatique (R-058). */
  async requestNewLink(token: string, requester: { email: string; id?: string }): Promise<LinkRequestResult> {
    return requestNewLinkImpl(
      { prisma: this.prisma, alertIt: (alert) => this.notificationService.queueLinkRequestAlert(alert) },
      token,
      requester,
    );
  }

  /** Signature d'un document par son lien (session exigée). */
  async sign(token: string, signer: SignerInput) {
    return signImpl(
      {
        prisma: this.prisma,
        encryption: this.encryption,
        timestampService: this.timestampService,
        events: this.events,
        logger: this.logger,
        uploadsDir: this.UPLOADS_DIR,
        pdfSnapshot: this.pdfSnapshotDeps,
      },
      token,
      signer,
    );
  }

  /** @deprecated Le PDF lit lui-même les images des signatures de son document. */
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

  /** Invalide tous les liens vivants du bon, avec leur motif (« remplacé »
   *  par défaut ; « contesté », « annulé »… selon l'appelant). */
  async invalidateUnsignedTokens(bonId: string, reason: SignatureInvalidationReason = 'replaced'): Promise<void> {
    return invalidateUnsignedTokensImpl({ prisma: this.prisma }, bonId, reason);
  }

  /**
   * Signature IT recueillie lors d'une déclaration de non-restitution ou d'un
   * équipement retrouvé ; `pdfType` (document concerné) est déduit de l'état
   * du bon quand l'appelant ne le donne pas.
   */
  async saveItPvSignature(
    bonId: string,
    signatureDataUrl: string,
    signerEmail: string,
    userId: string,
    pdfType?: ItSignatureDocument,
  ): Promise<void> {
    return saveItPvSignatureImpl(
      { prisma: this.prisma, encryption: this.encryption, logger: this.logger, uploadsDir: this.UPLOADS_DIR },
      bonId,
      signatureDataUrl,
      signerEmail,
      userId,
      pdfType,
    );
  }
}
