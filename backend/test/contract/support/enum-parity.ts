/**
 * Vérification À LA COMPILATION : les énumérations recopiées dans
 * src/contracts/common.ts (qui ne peut pas importer Prisma, puisqu'il est
 * copié vers le frontend) doivent rester identiques à celles de
 * prisma/schema.prisma. Une valeur ajoutée au schéma sans être ajoutée au
 * contrat fait échouer `tsc --noEmit` (étape « Type-check backend » de la CI).
 */
import type * as Db from '@prisma/client';
import type * as Contract from '../../../src/contracts/common';

type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Ne compile que si `A` et `B` sont la même union. */
export function assertSameUnion<A, B>(proof: SameUnion<A, B>): boolean {
  return proof;
}

export const ENUM_PARITY: readonly boolean[] = [
  assertSameUnion<Contract.UserRole, Db.UserRole>(true),
  assertSameUnion<Contract.BonStatus, Db.BonStatus>(true),
  assertSameUnion<Contract.Civilite, Db.Civilite>(true),
  assertSameUnion<Contract.EquipmentCategory, Db.EquipmentCategory>(true),
  assertSameUnion<Contract.SignatureType, Db.SignatureType>(true),
  assertSameUnion<Contract.PdfSnapshotType, Db.PdfSnapshotType>(true),
  assertSameUnion<Contract.ContestationStatus, Db.ContestationStatus>(true),
  assertSameUnion<Contract.NotificationType, Db.NotificationType>(true),
  assertSameUnion<Contract.NotificationStatus, Db.NotificationStatus>(true),
  assertSameUnion<Contract.SmbExportStatus, Db.SmbExportStatus>(true),
  assertSameUnion<Contract.ScheduledJobStatus, Db.ScheduledJobStatus>(true),
];
