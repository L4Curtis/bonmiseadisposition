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
import type { Attachment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockHolderUploadStage } from './holder-upload';
import { EncryptionService } from '../config/encryption.service';
import { ATTACHMENTS_DIR } from '../common/storage-paths';
import { AuditService } from '../audit/audit.service';

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

/** Ce que le service écrit d'une pièce jointe, hors étape (décidée par
 *  l'appelant : choisie par l'IT, déduite pour le collaborateur). */
type AttachmentData = Omit<Prisma.AttachmentUncheckedCreateInput, 'stage'>;

/** Fichier présent, pas trop gros, d'un type autorisé (octets magiques). */
function acceptFile(file: UploadedFile | undefined): { file: UploadedFile; mime: string } {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestException('Aucun fichier reçu');
  }
  if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new BadRequestException('Fichier trop volumineux (max 10 Mo)');
  }
  const mime = sniffMime(file.buffer);
  if (!mime) {
    throw new BadRequestException('Type de fichier non autorisé (JPEG, PNG, WebP ou PDF uniquement)');
  }
  return { file, mime };
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly UPLOADS_DIR = ATTACHMENTS_DIR;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
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

  /** Ajout par l'IT : l'étape choisie est gardée (« général » si inconnue). */
  create(
    bonId: string,
    file: UploadedFile | undefined,
    stage: string | undefined,
    label: string | undefined,
    user: { id?: string; email?: string },
  ) {
    const chosen = stage && ALLOWED_STAGES.includes(stage) ? stage : 'general';
    return this.store(bonId, file, label, user, (data) =>
      this.prisma.attachment.create({ data: { ...data, stage: chosen } }),
    );
  }

  /**
   * Ajout par le collaborateur titulaire : l'étape envoyée par le client est
   * ignorée, le serveur la déduit du document en attente. Contrôle de la
   * période de signature et écriture dans la même transaction, bon verrouillé
   * (voir holder-upload.ts).
   */
  createForHolder(
    bonId: string,
    file: UploadedFile | undefined,
    label: string | undefined,
    user: { id?: string; email?: string },
  ) {
    return this.store(bonId, file, label, user, (data) =>
      this.prisma.$transaction(async (tx) => {
        const stage = await lockHolderUploadStage(tx, bonId);
        return tx.attachment.create({ data: { ...data, stage } });
      }),
    );
  }

  /** Contrôle le fichier, l'écrit chiffré sur disque, puis la ligne par
   *  `insert` ; si l'écriture de la ligne échoue, le fichier est retiré. */
  private async store(
    bonId: string,
    file: UploadedFile | undefined,
    label: string | undefined,
    user: { id?: string; email?: string },
    insert: (data: AttachmentData) => Promise<Attachment>,
  ) {
    const { file: accepted, mime: detectedMime } = acceptFile(file);
    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: { id: true, reference: true, anonymizedAt: true },
    });
    if (!bon) throw new NotFoundException('Bon introuvable');
    if (bon.anonymizedAt) {
      throw new BadRequestException('Ce bon a été anonymisé (rétention) — aucune pièce jointe possible');
    }

    const sha256 = crypto.createHash('sha256').update(accepted.buffer).digest('hex');
    const storedPath = await this.writeEncrypted(bonId, accepted.buffer, detectedMime);
    // Nom d'origine assaini (affichage uniquement)
    const safeName = (accepted.originalname || 'piece-jointe').replace(/[^\w.\- ]+/g, '_').slice(0, 200);

    let created: Attachment;
    try {
      created = await insert({
        bonId, filename: safeName, storedPath, mimeType: detectedMime, size: accepted.buffer.length, sha256,
        label: label?.slice(0, 300) ?? null, uploadedById: user.id ?? null, uploadedByEmail: user.email ?? null,
      });
    } catch (err) {
      await this.removeStoredFile(storedPath);
      throw err;
    }

    await this.auditUpload(created, user);
    this.logger.log(`Pièce jointe ajoutée au bon ${bon.reference} (${detectedMime}, ${accepted.buffer.length}o)`);
    return this.toSafe(created);
  }

  /** Chiffrement AES-256-GCM du contenu (base64) sur disque, comme les signatures. */
  private async writeEncrypted(bonId: string, buffer: Buffer, mime: string): Promise<string> {
    try {
      const encrypted = this.encryption.encrypt(buffer.toString('base64'));
      const ext = EXT_BY_MIME[mime] ?? 'bin';
      const storedPath = `${bonId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}.enc`;
      await writeFile(path.join(this.UPLOADS_DIR, storedPath), encrypted, 'utf8');
      return storedPath;
    } catch (err) {
      this.logger.error(`Échec sauvegarde pièce jointe (bon=${bonId}): ${(err as Error).message}`);
      throw new BadRequestException('Erreur lors de la sauvegarde du fichier');
    }
  }

  private async removeStoredFile(storedPath: string): Promise<void> {
    await unlink(path.join(this.UPLOADS_DIR, storedPath)).catch((err: unknown) =>
      this.logger.warn(`Fichier pièce jointe orphelin non supprimé (${storedPath}): ${(err as Error).message}`),
    );
  }

  private async auditUpload(created: Attachment, user: { id?: string; email?: string }): Promise<void> {
    const { id, bonId, stage, filename, mimeType, size, sha256 } = created;
    await this.audit.recordSafely('attachment_uploaded', {
      actorId: user.id ?? null,
      actorEmail: user.email ?? null,
      bonId,
      details: { attachmentId: id, stage, filename, mimeType, size, sha256 },
    });
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

    await this.audit.recordSafely('attachment_deleted', {
      actorId: user.id ?? null,
      actorEmail: user.email ?? null,
      bonId,
      details: { attachmentId, filename: att.filename },
    });

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
        await unlink(fullPath).catch((err) =>
          this.logger.warn(`Fichier pièce jointe non supprimé lors de la purge (${basename}): ${(err as Error).message}`),
        );
      }
    }
    const { count } = await this.prisma.attachment.deleteMany({ where: { bonId } });
    return count;
  }
}
