import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService } from '../../signature/signature.service';
import { NotificationService } from '../../notification/notification.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';
import { AppConfigService } from '../../config/config.service';
import { DomainEventsPublisher } from '../../common/events';
import { ConfigRegistryService } from '../../config/config-registry.service';
import { recordSnapshotFailure } from '../../signature/pdf-snapshot';

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
  /** Lecture typée des réglages (registre de configuration). */
  settings: ConfigRegistryService;
  /** Publication des événements du domaine (emails des gestes du cycle de
   *  vie, remplacement d'un bon), toujours APRÈS la transaction. */
  events: DomainEventsPublisher;
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
    await recordSnapshotFailure(ctx.prisma, ctx.logger, { bonId, type: snapshotType, message });
    return null;
  }
}

/** Durée de validité (jours) d'un lien émis sous le verrou des liens du bon
 *  (PV de non-restitution, renvoi) : réglage `tokens.expiry_days` du
 *  registre, 1 à 30 jours, 7 par défaut (une saisie hors bornes est ramenée à
 *  la borne). */
export function getPvTokenValidityDays(ctx: BonsWorkflowContext): Promise<number> {
  return ctx.settings.getInt('tokens.expiry_days');
}
