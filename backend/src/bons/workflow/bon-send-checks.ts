import type { MissingSerialLine, SendChecksResponse, SendSerialConflict } from '../../contracts/bons';
import { PrismaService } from '../../prisma/prisma.service';
import { findSerialConflicts } from '../../equipment/equipment-serial';
import { writeAuditEntry } from '../../audit/audit-record';
import type { AuditWriter } from '../../audit/audit-record';
import { missingSerialsError, serialConflictsError } from '../bon-errors';

/**
 * Contrôles à faire AVANT la remise d'un bon, par email comme au guichet
 * (R-003) — et avant de demander la signature IT, pour que le technicien ne
 * signe pas pour rien :
 *  - lignes sans numéro de série NI numéro d'inventaire : l'équipement remis
 *    ne serait pas identifiable ; il faut confirmer explicitement ;
 *  - numéros de série déjà en circulation sur un autre bon en cours (hors le
 *    bon que celui-ci remplace : ses équipements sont les mêmes, par nature).
 * Chaque confirmation est tracée dans le journal d'audit.
 */

interface CheckedEquipment {
  readonly id: string;
  readonly order: number;
  readonly serialNumber: string | null;
  readonly inventoryNumber: string | null;
  readonly customLabel: string | null;
  readonly catalogItem: { brand: string; model: string } | null;
}

export interface CheckedBon {
  readonly id: string;
  readonly equipments: readonly CheckedEquipment[];
  /** Bon d'origine d'un bon remplaçant (contestation Fondée), s'il y en a un. */
  readonly replacesBon?: { readonly reference: string } | null;
}

/** Ce que l'IT a confirmé en connaissance de cause. */
export interface SendConfirmations {
  readonly confirmSerialConflicts?: boolean;
  readonly confirmMissingSerials?: boolean;
}

function equipmentLabel(e: CheckedEquipment): string {
  return e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : (e.customLabel ?? 'Équipement');
}

/** Lignes qu'aucun numéro n'identifie, dans l'ordre du bon (position à partir de 1). */
export function findMissingSerialLines(bon: CheckedBon): MissingSerialLine[] {
  return bon.equipments
    .map((e, index) => ({ e, position: index + 1 }))
    .filter(({ e }) => !e.serialNumber?.trim() && !e.inventoryNumber?.trim())
    .map(({ e, position }) => ({ equipmentId: e.id, position, label: equipmentLabel(e) }));
}

export async function computeSendChecks(prisma: PrismaService, bon: CheckedBon): Promise<SendChecksResponse> {
  const serials = bon.equipments.map((e) => e.serialNumber).filter((s): s is string => !!s);
  const { items } = await findSerialConflicts(prisma, serials, bon.id);
  const replaced = bon.replacesBon?.reference ?? null;
  const serialConflicts: SendSerialConflict[] = items
    .filter((item): item is typeof item & { serialNumber: string } => item.serialNumber !== null)
    .filter((item) => item.bonReference !== replaced)
    .map(({ serialNumber, bonReference }) => ({ serialNumber, bonReference }));
  return { missingSerials: findMissingSerialLines(bon), serialConflicts };
}

/**
 * Refuse la remise tant qu'un contrôle n'est pas confirmé (409 avec le détail,
 * que l'écran affiche avant la signature IT). Renvoie les contrôles, pour
 * l'audit des confirmations.
 */
export async function assertSendChecksConfirmed(
  prisma: PrismaService,
  bon: CheckedBon,
  confirmations: SendConfirmations,
): Promise<SendChecksResponse> {
  const checks = await computeSendChecks(prisma, bon);
  if (checks.missingSerials.length > 0 && !confirmations.confirmMissingSerials) {
    throw missingSerialsError(checks.missingSerials);
  }
  if (checks.serialConflicts.length > 0 && !confirmations.confirmSerialConflicts) {
    throw serialConflictsError(checks.serialConflicts);
  }
  return checks;
}

/** Trace dans l'audit les contrôles passés outre, sur confirmation de l'IT
 *  (dans la transaction de la remise quand l'appelant en tient une). */
export async function auditConfirmedChecks(
  writer: AuditWriter,
  bonId: string,
  actorId: string | null,
  checks: SendChecksResponse,
): Promise<void> {
  if (checks.missingSerials.length > 0) {
    await writeAuditEntry(writer, 'bon_sent_without_serial', {
      actorId,
      bonId,
      details: { lines: checks.missingSerials.map(({ position, label }) => ({ position, label })) },
    });
  }
  if (checks.serialConflicts.length > 0) {
    await writeAuditEntry(writer, 'bon_sent_with_serial_conflicts', {
      actorId,
      bonId,
      details: { conflicts: checks.serialConflicts.map((c) => ({ ...c })) },
    });
  }
}
