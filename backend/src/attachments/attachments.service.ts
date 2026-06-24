import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_STAGES = ['mise_disposition', 'restitution', 'pv_cloture', 'general'];

/** Détection du type RÉEL par octets magiques — on ne fait pas confiance au
 *  Content-Type fourni par le client. */
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly UPLOADS_DIR = path.join(process.cwd(), 'data', 'attachments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {
    if (!fs.existsSync(this.UPLOADS_DIR)) {
      fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
    }
  }

  /** Métadonnées sûres (jamais le chemin de stockage interne). */
  private toSafe(a: {
    id: string;
    bonId: string;
    stage: string;
    filename: string;
    mimeType: string;
    size: number;
    sha256: string;
    label: string | null;
    uploadedByEmail: string | null;
    createdAt: Date;
  }) {
    return {
      id: a.id,
      bonId: a.bonId,
      stage: a.stage,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      sha256: a.sha256,
      label: a.label,
      uploadedByEmail: a.uploadedByEmail,
      createdAt: a.createdAt,
    };
  }

  async list(bonId: string) {
    const rows = await this.prisma.attachment.findMany({
      where: { bonId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toSafe(r));
  }

  async create(
    bonId: string,
    file: UploadedFile | undefined,
    stage: string | undefined,
    label: string | undefined,
    user: { id?: string; email?: string },
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('Fichier trop volumineux (max 10 Mo)');
    }

    const effectiveStage = stage && ALLOWED_STAGES.includes(stage) ? stage : 'general';

    const detectedMime = sniffMime(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException('Type de fichier non autorisé (JPEG, PNG, WebP ou PDF uniquement)');
    }

    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: { id: true, reference: true, anonymizedAt: true },
    });
    if (!bon) throw new NotFoundException('Bon introuvable');
    if (bon.anonymizedAt) {
      throw new BadRequestException('Ce bon a été anonymisé (rétention) — aucune pièce jointe possible');
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Chiffrement AES-256-GCM du contenu (base64) sur disque, comme les signatures
    let storedPath: string;
    try {
      const encrypted = this.encryption.encrypt(file.buffer.toString('base64'));
      const ext = EXT_BY_MIME[detectedMime] ?? 'bin';
      storedPath = `${bonId}_${effectiveStage}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}.enc`;
      await writeFile(path.join(this.UPLOADS_DIR, storedPath), encrypted, 'utf8');
    } catch (err) {
      this.logger.error(`Échec sauvegarde pièce jointe (bon=${bonId}): ${(err as Error).message}`);
      throw new BadRequestException('Erreur lors de la sauvegarde du fichier');
    }

    // Nom d'origine assaini (affichage uniquement)
    const safeName = (file.originalname || 'piece-jointe')
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 200);

    const created = await this.prisma.attachment.create({
      data: {
        bonId,
        stage: effectiveStage,
        filename: safeName,
        storedPath,
        mimeType: detectedMime,
        size: file.buffer.length,
        sha256,
        label: label?.slice(0, 300) ?? null,
        uploadedById: user.id ?? null,
        uploadedByEmail: user.email ?? null,
      },
    });

    await this.prisma.auditLog
      .create({
        data: {
          bonId,
          userId: user.id ?? null,
          userEmail: user.email ?? null,
          action: 'attachment_uploaded',
          details: { attachmentId: created.id, stage: effectiveStage, filename: safeName, mimeType: detectedMime, size: file.buffer.length, sha256 },
        },
      })
      .catch(() => { /* non-blocking */ });

    this.logger.log(`Pièce jointe ajoutée au bon ${bon.reference} (${detectedMime}, ${file.buffer.length}o)`);
    return this.toSafe(created);
  }

  async download(bonId: string, attachmentId: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const att = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!att || att.bonId !== bonId) throw new NotFoundException('Pièce jointe introuvable');

    // Protection traversée de chemin (le storedPath est généré côté serveur,
    // mais on revérifie par principe)
    const basename = path.basename(att.storedPath);
    if (basename !== att.storedPath) throw new NotFoundException('Pièce jointe introuvable');
    const fullPath = path.join(this.UPLOADS_DIR, basename);
    if (!fullPath.startsWith(this.UPLOADS_DIR) || !fs.existsSync(fullPath)) {
      throw new NotFoundException('Fichier introuvable sur le disque');
    }

    try {
      const encrypted = await readFile(fullPath, 'utf8');
      const buffer = Buffer.from(this.encryption.decrypt(encrypted), 'base64');
      return { buffer, filename: att.filename, mimeType: att.mimeType };
    } catch (err) {
      this.logger.error(`Échec lecture pièce jointe ${attachmentId}: ${(err as Error).message}`);
      throw new NotFoundException('Fichier illisible');
    }
  }

  async remove(bonId: string, attachmentId: string, user: { id?: string; email?: string }) {
    const att = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!att || att.bonId !== bonId) throw new NotFoundException('Pièce jointe introuvable');

    // Supprimer le fichier d'abord (best-effort), puis la ligne
    const basename = path.basename(att.storedPath);
    const fullPath = path.join(this.UPLOADS_DIR, basename);
    if (fullPath.startsWith(this.UPLOADS_DIR) && fs.existsSync(fullPath)) {
      await unlink(fullPath).catch((err) =>
        this.logger.warn(`Fichier pièce jointe non supprimé (${basename}): ${(err as Error).message}`),
      );
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });

    await this.prisma.auditLog
      .create({
        data: {
          bonId,
          userId: user.id ?? null,
          userEmail: user.email ?? null,
          action: 'attachment_deleted',
          details: { attachmentId, filename: att.filename },
        },
      })
      .catch(() => { /* non-blocking */ });

    this.logger.log(`Pièce jointe ${attachmentId} supprimée du bon ${bonId} par ${user.email ?? 'inconnu'}`);
    return { ok: true };
  }

  /** Purge RGPD : supprime les fichiers + lignes d'un bon (appelé par la rétention). */
  async purgeForBon(bonId: string): Promise<number> {
    const rows = await this.prisma.attachment.findMany({ where: { bonId }, select: { id: true, storedPath: true } });
    for (const r of rows) {
      const basename = path.basename(r.storedPath);
      const fullPath = path.join(this.UPLOADS_DIR, basename);
      if (fullPath.startsWith(this.UPLOADS_DIR) && fs.existsSync(fullPath)) {
        await unlink(fullPath).catch(() => { /* best-effort */ });
      }
    }
    const { count } = await this.prisma.attachment.deleteMany({ where: { bonId } });
    return count;
  }
}
