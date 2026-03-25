import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { PdfService, SigImages, BonForPdf } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import { BonStatus, SignatureEntry } from '../common/types';

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);
  private readonly UPLOADS_DIR = path.join(process.cwd(), 'data', 'signatures');
  private readonly TOKEN_VALIDITY_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly pdfService: PdfService,
    private readonly smbService: SmbService,
  ) {
    // Ensure signatures directory exists
    if (!fs.existsSync(this.UPLOADS_DIR)) {
      fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
    }
  }

  /** Generate a signature token for a bon (mise_disposition, restitution, or pv_cloture) */
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

    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(
      Date.now() + this.TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
    );

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

  /** Public endpoint: get bon info from token (no auth required) */
  async getBonInfoByToken(token: string) {
    const sig = await this.prisma.signature.findUnique({
      where: { token },
      include: {
        bon: {
          include: {
            filiale: true,
            collaborateur: { select: { id: true, displayName: true, email: true, department: true } },
            createdBy: { select: { id: true, displayName: true } },
            equipments: {
              orderBy: { order: 'asc' },
              include: {
                catalogItem: { select: { id: true, brand: true, model: true, category: true } },
              },
            },
          },
        },
      },
    });

    if (!sig) throw new NotFoundException('Lien de signature invalide');

    if (sig.signed) {
      return { status: 'already_signed', bon: sig.bon, signature: sig };
    }

    if (new Date() > sig.tokenExpiresAt) {
      return { status: 'expired', bon: sig.bon, signature: sig };
    }

    return { status: 'pending', bon: sig.bon, signature: sig };
  }

  /** Sign a document — called after SSO auth with email verification */
  async sign(
    token: string,
    signatureDataUrl: string,
    mentionLuApprouve: boolean,
    signerEmail: string,
    signerIp: string,
    signerUserAgent: string,
  ) {
    const sig = await this.prisma.signature.findUnique({
      where: { token },
      include: {
        bon: {
          include: {
            filiale: true,
            collaborateur: { select: { id: true, displayName: true, email: true } },
            equipments: {
              orderBy: { order: 'asc' },
              include: { catalogItem: true },
            },
            signatures: true,
          },
        },
      },
    });

    if (!sig) throw new NotFoundException('Lien de signature invalide');
    if (sig.signed) throw new BadRequestException('Ce document a déjà été signé');
    if (new Date() > sig.tokenExpiresAt) throw new BadRequestException('Ce lien de signature a expiré');

    // Email verification (skip for in-person mode initiated by IT staff)
    if (!sig.isInPerson) {
      const expectedEmail = sig.bon.collaborateurEmail.toLowerCase().trim();
      const actualEmail = signerEmail.toLowerCase().trim();
      if (expectedEmail !== actualEmail) {
        throw new ForbiddenException(
          `Ce document est destiné à ${sig.bon.collaborateurEmail}, pas à ${signerEmail}`,
        );
      }
    }

    if (!mentionLuApprouve) {
      throw new BadRequestException('Vous devez cocher "Lu et approuvé" pour signer');
    }

    // Validate base64 signature
    if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
      throw new BadRequestException('Format de signature invalide');
    }

    // Save encrypted signature file (outside transaction — file system op)
    const signatureImagePath = await this.saveSignatureFile(
      sig.bon.id,
      sig.type,
      signatureDataUrl,
    );

    // Atomic transaction: update signature + bon status + audit log
    const newStatus = this.getNextBonStatus(sig.bon.status, sig.type);
    const { updatedSig, updatedBon } = await this.prisma.$transaction(async (tx) => {
      // Re-check signature not already signed (prevent race condition)
      const freshSig = await tx.signature.findUnique({ where: { token }, select: { signed: true } });
      if (freshSig?.signed) {
        throw new BadRequestException('Ce document a déjà été signé (concurrent)');
      }

      const txUpdatedSig = await tx.signature.update({
        where: { token },
        data: {
          signed: true,
          signatureImagePath,
          signedAt: new Date(),
          signerEmail,
          signerIp,
          signerUserAgent,
          mentionLuApprouve,
        },
      });

      const txUpdatedBon = await tx.bon.update({
        where: { id: sig.bon.id },
        data: { status: newStatus as BonStatus },
        include: {
          filiale: true,
          collaborateur: { select: { id: true, displayName: true, email: true } },
          equipments: {
            orderBy: { order: 'asc' },
            include: { catalogItem: true },
          },
          signatures: true,
        },
      });

      await tx.auditLog.create({
        data: {
          bonId: sig.bon.id,
          userEmail: signerEmail,
          action: `signed_${sig.type}`,
          details: {
            isInPerson: sig.isInPerson,
            mentionLuApprouve,
            newStatus,
          },
          ipAddress: signerIp,
          userAgent: signerUserAgent,
        },
      });

      return { updatedSig: txUpdatedSig, updatedBon: txUpdatedBon };
    });

    this.logger.log(
      `Bon ${sig.bon.reference} signé (${sig.type}) par ${signerEmail} — nouveau statut: ${newStatus}`,
    );

    // Génération asynchrone du snapshot PDF (fire & forget — ne bloque pas la réponse)
    const snapshotType = sig.type === 'restitution'
      ? 'signature_collab_restitution'
      : sig.type === 'pv_cloture'
      ? 'cloture_equipements_manquants'
      : 'signature_collab_mise_disposition';
    this.generatePdfSnapshot(updatedBon, snapshotType).catch((err) =>
      this.logger.error(`Échec génération snapshot PDF: ${err.message}`),
    );

    return { signature: updatedSig, bon: updatedBon };
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
        include: {
          filiale: true,
          collaborateur: { select: { id: true, displayName: true, email: true } },
          equipments: { orderBy: { order: 'asc' }, include: { catalogItem: true } },
          signatures: true,
        },
      });
      return { ok: true, bon: existingBon, signature: recentItCachet };
    }

    const bon = await this.prisma.bon.findUniqueOrThrow({
      where: { id: bonId },
      include: {
        filiale: true,
        collaborateur: { select: { id: true, displayName: true, email: true } },
        equipments: { orderBy: { order: 'asc' }, include: { catalogItem: true } },
        signatures: true,
      },
    });

    if (['cancelled', 'archived', 'contested'].includes(bon.status)) {
      throw new BadRequestException('Ce bon est clôturé ou contesté et ne peut plus être modifié');
    }

    if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
      throw new BadRequestException('Format de signature invalide');
    }

    // Invalidate any existing unsigned it_cachet tokens
    await this.prisma.signature.updateMany({
      where: { bonId, type: 'it_cachet', signed: false },
      data: { tokenExpiresAt: new Date(0) },
    });

    // Save encrypted signature file
    const signatureImagePath = await this.saveSignatureFile(bonId, 'it_cachet', signatureDataUrl);

    // Create it_cachet signature record (already signed — no token exchange needed)
    const itSig = await this.prisma.signature.create({
      data: {
        bonId,
        type: 'it_cachet',
        token: crypto.randomUUID(),
        tokenExpiresAt: new Date(0),
        signed: true,
        signatureImagePath,
        signedAt: new Date(),
        signerEmail,
        signerIp,
        signerUserAgent,
        mentionLuApprouve: true,
        isInPerson: true,
        initiatedById: null,
      },
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
      include: {
        filiale: true,
        collaborateur: { select: { id: true, displayName: true, email: true } },
        equipments: { orderBy: { order: 'asc' }, include: { catalogItem: true } },
        signatures: true,
      },
    });

    // Regenerate PDF snapshot with IT signature (fire & forget)
    const isRestitution = pdfType === 'restitution' || ['sent_restitution', 'partially_returned'].includes(bon.status);
    const itSnapshotType = isRestitution ? 'signature_it_restitution' : 'signature_it_mise_disposition';
    this.generatePdfSnapshot(updatedBon, itSnapshotType).catch((err) =>
      this.logger.error(`Échec snapshot PDF IT cachet: ${err.message}`),
    );

    return { ok: true, bon: updatedBon, signature: itSig };
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
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
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
      restitution: { from: ['sent_restitution', 'partially_returned'], to: 'archived' },
      pv_cloture: { from: ['partially_returned'], to: 'archived' },
    };

    const transition = validTransitions[signatureType];
    if (transition && transition.from.includes(currentStatus)) {
      return transition.to;
    }

    if (transition && !transition.from.includes(currentStatus)) {
      this.logger.warn(
        `Invalid status transition: ${currentStatus} → ${transition.to} via ${signatureType}. Keeping current status.`,
      );
    }

    return currentStatus;
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
    if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
      throw new Error('Format de signature invalide');
    }
    const signatureImagePath = await this.saveSignatureFile(bonId, 'it_cachet', signatureDataUrl);
    await this.prisma.signature.create({
      data: {
        bonId,
        type: 'it_cachet',
        token: crypto.randomUUID(),
        tokenExpiresAt: new Date(0),
        signed: true,
        signatureImagePath,
        signedAt: new Date(),
        signerEmail,
        mentionLuApprouve: true,
        isInPerson: true,
        initiatedById: userId,
      },
    });
  }
}
