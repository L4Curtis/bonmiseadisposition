import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BonStatus } from '@prisma/client';
import { findBonDetailOrThrow } from '../bons/queries/bon-where';
import { computeBonFacts } from '../bons/workflow/bon-facts';
import { pendingDocument } from '../bons/workflow/state-machine';

/**
 * Statuts pendant lesquels un collaborateur peut encore ajouter/supprimer des
 * pièces jointes — la « période de signature ». Hors de cette fenêtre (bon
 * brouillon, archivé, contesté…) le bon est figé côté collaborateur : ajouter
 * une PJ après coup modifierait un dossier déjà clos/probant.
 */
export const COLLAB_ATTACHMENT_WINDOW_STATUSES: readonly BonStatus[] = [
  'sent_mise_dispo',
  'sent_restitution',
  'partially_returned',
];

export const HOLDER_UPLOAD_REFUSED_MESSAGE =
  'Vous ne pouvez ajouter des pièces jointes que pendant la période de signature';

/** Étape d'une pièce jointe hors d'un document en attente. */
const GENERAL_STAGE = 'general';

/**
 * Étape de la pièce jointe d'un collaborateur, décidée par le serveur : le
 * document qui attend sa signature (remise, restitution, PV), sinon
 * « général ». À appeler dans la transaction qui écrit la pièce : la ligne du
 * bon est verrouillée (`FOR UPDATE`), si bien qu'aucun changement de statut ne
 * peut se glisser entre ce contrôle et l'écriture. Hors période de
 * signature : 403.
 */
export async function lockHolderUploadStage(tx: Prisma.TransactionClient, bonId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ status: string }[]>(
    Prisma.sql`SELECT status::text AS status FROM bons WHERE id = ${bonId} FOR UPDATE`,
  );
  if (rows.length === 0) throw new NotFoundException('Bon introuvable');
  if (!(COLLAB_ATTACHMENT_WINDOW_STATUSES as readonly string[]).includes(rows[0].status)) {
    throw new ForbiddenException(HOLDER_UPLOAD_REFUSED_MESSAGE);
  }
  const bon = await findBonDetailOrThrow(tx, bonId);
  return pendingDocument(computeBonFacts(bon)) ?? GENERAL_STAGE;
}
