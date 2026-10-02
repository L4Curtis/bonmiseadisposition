import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UpdateBonDto } from '../dto/bon.dto';
import { Civilite } from '../../common/types';
import { findBonDetailOrThrow } from '../queries/bon-where';
import {
  assertCatalogItemsUsable,
  assertFilialeUsable,
  assertNoDuplicateSerials,
  normalizeEquipmentInput,
} from '../validation/bon-validators';
import { BonsWorkflowContext } from './bon-context';
import { assertActionAllowed, statusChangedMeanwhile } from './bon-guards';
import { invalidateItSignatures, invalidatePendingLinks } from './bon-links';
import { blankToNull, rememberCivilite } from './bon-crud';
import { documentChanges, documentChangesLabel } from './bon-document-diff';
import { writeAuditEntry } from '../../audit/audit-record';

/**
 * Modification d'un bon : brouillon, ou bon envoyé mais pas encore signé
 * (décision du 24/09, R-012). Pour un bon envoyé, la modification :
 *  - invalide le lien en attente (motif « bon modifié ») ;
 *  - retire leur valeur aux signatures IT de la remise : une NOUVELLE
 *    signature IT est exigée avant le nouveau lien ;
 *  - redémarre l'horloge de la demande ;
 *  - est tracée dans l'audit (« bon modifié après envoi », champs modifiés).
 * La modification d'un brouillon est tracée elle aussi (« bon modifié »),
 * dès qu'elle change le document.
 * Le nouveau lien part ensuite par le parcours habituel (signature IT, puis
 * « Renvoyer » ou lien au guichet).
 *
 * Seul un changement du DOCUMENT a ces effets (voir bon-document-diff.ts) :
 * modifier seulement la « Note interne IT » laisse le lien et la signature IT
 * valables, le collaborateur ne voit rien de cette note.
 */
export async function updateBon(ctx: BonsWorkflowContext, id: string, dto: UpdateBonDto, actorId: string | null): Promise<void> {
  const bon = await findBonDetailOrThrow(ctx.prisma, id);
  assertActionAllowed(bon, 'edit');
  assertDates(dto, bon);
  const changes = documentChanges(bon, dto);
  const documentChanged = changes.length > 0;
  const { equipments: newEquipments, ...columns } = await buildUpdateData(ctx, dto);
  // Lignes inchangées : on les garde (mêmes identifiants), rien à réécrire.
  const rewritesEquipments = changes.includes('equipments');
  const data: Prisma.BonUncheckedUpdateInput = rewritesEquipments ? { ...columns, equipments: newEquipments } : columns;
  const renewsRequest = bon.status === 'sent_mise_dispo' && documentChanged;

  // Transition conditionnelle : un envoi ou une signature concurrente perd la
  // course, au lieu de voir un bon déjà avancé réécrit en silence. Le
  // remplacement des équipements est annulé avec elle en cas d'erreur.
  await ctx.prisma.$transaction(async (tx) => {
    const claimed = await tx.bon.updateMany({
      where: { id, status: bon.status },
      data: renewsRequest ? { awaitingSince: new Date() } : { status: bon.status },
    });
    if (claimed.count === 0) throw statusChangedMeanwhile();
    if (rewritesEquipments) await tx.bonEquipment.deleteMany({ where: { bonId: id } });
    await tx.bon.update({ where: { id }, data, select: { id: true } });
    if (documentChanged) await invalidateItSignatures(tx, id, 'mise_disposition', 'modified');
    if (renewsRequest) await invalidatePendingLinks(tx, id, 'modified');
  });

  await rememberCivilite(ctx, (data.collaborateurId as string | undefined) ?? bon.collaborateurId, data.civilite as Civilite | undefined);
  if (documentChanged) {
    const details = { fields: changes, fieldsLabel: documentChangesLabel(changes) };
    await writeAuditEntry(ctx.prisma, renewsRequest ? 'bon_modified_after_send' : 'bon_updated', { actorId, bonId: id, details });
  }
}

function isoDay(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function assertDates(dto: UpdateBonDto, bon: { dateMiseDisposition: Date; dateRestitution: Date | null }): void {
  const miseDispo = dto.dateMiseDisposition ?? isoDay(bon.dateMiseDisposition);
  const restitution =
    dto.dateRestitution !== undefined ? dto.dateRestitution : bon.dateRestitution ? isoDay(bon.dateRestitution) : null;
  if (restitution && restitution < miseDispo) {
    throw new BadRequestException('La date de restitution ne peut pas précéder la date de mise à disposition');
  }
}

async function buildUpdateData(ctx: BonsWorkflowContext, dto: UpdateBonDto): Promise<Prisma.BonUncheckedUpdateInput> {
  const data: Prisma.BonUncheckedUpdateInput = {};
  if (dto.filialeId) {
    await assertFilialeUsable(ctx.prisma, dto.filialeId);
    data.filialeId = dto.filialeId;
  }
  if (dto.collaborateurId) {
    const collaborateur = await ctx.prisma.user.findUnique({ where: { id: dto.collaborateurId } });
    if (!collaborateur) throw new NotFoundException('Collaborateur introuvable');
    if (!collaborateur.active) throw new BadRequestException('Le collaborateur est désactivé');
    data.collaborateurId = dto.collaborateurId;
    data.collaborateurEmail = collaborateur.email;
  }
  if (dto.civilite) data.civilite = dto.civilite as Civilite;
  if (dto.dateMiseDisposition) data.dateMiseDisposition = new Date(dto.dateMiseDisposition);
  if (dto.dateRestitution !== undefined) data.dateRestitution = dto.dateRestitution ? new Date(dto.dateRestitution) : null;
  if (dto.notes !== undefined) data.notes = blankToNull(dto.notes);
  if (dto.internalNote !== undefined) data.internalNote = blankToNull(dto.internalNote);
  if (dto.equipments !== undefined) {
    const equipments = dto.equipments.map((e, idx) => normalizeEquipmentInput(e, idx));
    await assertCatalogItemsUsable(ctx.prisma, equipments.map((e) => e.catalogItemId).filter((c): c is string => !!c));
    assertNoDuplicateSerials(equipments);
    data.equipments = { create: equipments };
  }
  return data;
}
