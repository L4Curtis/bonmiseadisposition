import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { PdfService, SigImages } from '../pdf/pdf.service';

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);
  private readonly UPLOADS_DIR = path.join(process.cwd(), 'data', 'signatures');
  private readonly TOKEN_VALIDITY_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly pdfService: PdfService,
  ) {
    // Ensure signatures directory exists
    if (!fs.existsSync(this.UPLOADS_DIR)) {
      fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
    }
  }

  /** Generate a signature token for a bon (mise_disposition or restitution) */
  async generateToken(
    bonId: string,
    type: 'mise_disposition' | 'restitution',
    initiatedById?: string,
    isInPerson = false,
  ) {
    // Invalidate previous unsigned tokens of same type
    await this.prisma.signature.updateMany({
      where: { bonId, type: type as any, signed: false },
      data: { tokenExpiresAt: new Date(0) }, // expire immediately
    });

    const token = crypto.randomUUID();
    const tokenExpiresAt = new Date(
      Date.now() + this.TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.prisma.signature.create({
      data: {
        bonId,
        type: type as any,
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

    // Save encrypted signature file
    const signatureImagePath = await this.saveSignatureFile(
      sig.bon.id,
      sig.type,
      signatureDataUrl,
    );

    // Update signature record
    const updatedSig = await this.prisma.signature.update({
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

    // Update bon status
    const newStatus = this.getNextBonStatus(sig.bon.status as string, sig.type as string);
    const updatedBon = await this.prisma.bon.update({
      where: { id: sig.bon.id },
      data: { status: newStatus as any },
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

    // Audit log
    await this.prisma.auditLog.create({
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

    this.logger.log(
      `Bon ${sig.bon.reference} signé (${sig.type}) par ${signerEmail} — nouveau statut: ${newStatus}`,
    );

    // Génération asynchrone du snapshot PDF (fire & forget — ne bloque pas la réponse)
    const pdfType: 'mise_disposition' | 'restitution' =
      sig.type === 'restitution' ? 'restitution' : 'mise_disposition';
    this.generatePdfSnapshot(updatedBon, pdfType).catch((err) =>
      this.logger.error(`Échec génération snapshot PDF: ${err.message}`),
    );

    return { signature: updatedSig, bon: updatedBon };
  }

  /** Génère et sauvegarde en DB le snapshot PDF au moment de la signature */
  private async generatePdfSnapshot(bon: any, signatureType: 'mise_disposition' | 'restitution'): Promise<void> {
    const sigImages = await this.getSignatureImagesForBon(bon.signatures || []);
    await this.pdfService.generateAndSave(bon, signatureType, sigImages);
  }

  /** Resolve decrypted SigImages for a list of signatures (used by BonsController for on-the-fly PDF) */
  async getSignatureImagesForBon(signatures: any[]): Promise<SigImages> {
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
    const bon = await this.prisma.bon.findUniqueOrThrow({
      where: { id: bonId },
      include: {
        filiale: true,
        collaborateur: { select: { id: true, displayName: true, email: true } },
        equipments: { orderBy: { order: 'asc' }, include: { catalogItem: true } },
        signatures: true,
      },
    });

    if (['cancelled', 'archived'].includes(bon.status as string)) {
      throw new BadRequestException('Ce bon est clôturé et ne peut plus être modifié');
    }

    if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
      throw new BadRequestException('Format de signature invalide');
    }

    // Invalidate any existing unsigned it_cachet tokens
    await this.prisma.signature.updateMany({
      where: { bonId, type: 'it_cachet' as any, signed: false },
      data: { tokenExpiresAt: new Date(0) },
    });

    // Save encrypted signature file
    const signatureImagePath = await this.saveSignatureFile(bonId, 'it_cachet', signatureDataUrl);

    // Create it_cachet signature record (already signed — no token exchange needed)
    const itSig = await this.prisma.signature.create({
      data: {
        bonId,
        type: 'it_cachet' as any,
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

    this.logger.log(`Bon ${(bon as any).reference} — cachet IT signé par ${signerEmail}`);

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
    const resolvedPdfType: 'mise_disposition' | 'restitution' =
      pdfType ?? (['sent_restitution', 'archived'].includes(bon.status as string) ? 'restitution' : 'mise_disposition');
    this.generatePdfSnapshot(updatedBon, resolvedPdfType).catch((err) =>
      this.logger.error(`Échec snapshot PDF IT cachet: ${err.message}`),
    );

    return { ok: true, bon: updatedBon, signature: itSig };
  }

  /** Get decrypted signature image for PDF generation */
  async getSignatureImageDecrypted(signatureImagePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(process.cwd(), 'data', 'signatures', signatureImagePath);
      if (!fs.existsSync(fullPath)) return null;
      const encrypted = fs.readFileSync(fullPath, 'utf8');
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
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const encrypted = this.encryption.encrypt(base64);
    const filename = `${bonId}_${type}_${Date.now()}.enc`;
    const filepath = path.join(this.UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, encrypted, 'utf8');
    return filename;
  }

  private getNextBonStatus(currentStatus: string, signatureType: string): string {
    if (signatureType === 'mise_disposition') {
      // After mise_dispo signature → active
      return 'active';
    }
    if (signatureType === 'restitution') {
      // After restitution signature → archived
      return 'archived';
    }
    return currentStatus;
  }
}
