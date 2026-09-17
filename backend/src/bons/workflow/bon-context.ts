import { ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService } from '../../signature/signature.service';
import { NotificationService } from '../../notification/notification.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';
import { AppConfigService } from '../../config/config.service';

/**
 * Dépendances explicites partagées par les étapes du cycle de vie d'un bon
 * (bons/workflow/*), construites une seule fois par BonsService et transmises
 * à chaque fonction plutôt qu'un accès implicite via `this`.
 */
export interface BonsWorkflowContext {
  prisma: PrismaService;
  signatureService: SignatureService;
  notificationService: NotificationService;
  pdfService: PdfService;
  smbService: SmbService;
  configService: AppConfigService;
  logger: Logger;
}

/**
 * Enveloppe pdfService.generateAndSave : celui-ci persiste désormais
 * ProofArchive + PdfSnapshot + audit dans une transaction et REMONTE toute
 * erreur (lot E) au lieu de l'avaler. Dans tous les appelants ci-dessous, la
 * signature/transition métier est déjà commitée AVANT cet appel — une
 * exception ici ne doit donc pas se traduire par un 500 qui masquerait une
 * action pourtant réussie. On logge, on trace un audit `pdf_snapshot_failed`
 * (régénérable ensuite via POST /admin/pdf/regenerate-missing), et on
 * renvoie null : l'appelant saute alors l'export SMB (pas de buffer) sans
 * échouer la requête.
 */
export async function generateAndSaveSnapshot(
  ctx: BonsWorkflowContext,
  bonId: string,
  ...args: Parameters<PdfService['generateAndSave']>
): Promise<Buffer | null> {
  const [, snapshotType] = args;
  try {
    return await ctx.pdfService.generateAndSave(...args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error(
      `Échec génération/sauvegarde du snapshot PDF [${snapshotType}] pour le bon ${bonId} (action déjà effectuée, non bloquant) : ${message}`,
    );
    await ctx.prisma.auditLog
      .create({
        data: { bonId, action: 'pdf_snapshot_failed', details: { type: snapshotType, error: message } },
      })
      .catch(() => undefined);
    return null;
  }
}

/** Durée de validité (jours) du token pv_cloture — même réglage admin-
 *  configurable que SignatureService.generateToken (tokens.expiry_days),
 *  dupliqué ici car nécessaire à l'intérieur du verrou advisory de
 *  emitPvClotureIfDue (voir ce commentaire pour le pourquoi). */
export async function getPvTokenValidityDays(ctx: BonsWorkflowContext): Promise<number> {
  const DEFAULT_DAYS = 7;
  const raw = await ctx.configService.get('tokens', 'expiry_days');
  const parsed = raw === null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(30, Math.max(1, parsed));
}

/**
 * Empêche de modifier les équipements (déclarer non-rendu, marquer retrouvé)
 * pendant qu'une signature de restitution est en vol chez le collaborateur :
 * invalidateUnsignedTokens détruirait ce lien et la restitution déjà
 * effectuée par le collaborateur ne serait jamais co-signée.
 */
export async function assertNoPendingRestitutionSignature(ctx: BonsWorkflowContext, bonId: string): Promise<void> {
  const pendingRestitutionSig = await ctx.prisma.signature.findFirst({
    where: { bonId, type: 'restitution', signed: false, tokenExpiresAt: { gt: new Date() } },
  });
  if (pendingRestitutionSig) {
    throw new ConflictException(
      'Une signature de restitution est en attente du collaborateur. Attendez-la ou renvoyez le lien avant de modifier les équipements.',
    );
  }
}
