import { NotificationBon } from '../../common/types';
import { groupRestitutionEquipments, RestitutionGroups, restitutionWindowUntil } from '../../common/restitution-groups';
import { buildEquipList } from './equipment-lists';

/**
 * Découpage d'une restitution dans les emails, comme dans le PDF
 * (common/restitution-groups.ts) : « Équipements restitués » ne liste que ce
 * qui est rendu CETTE fois ; ce qui l'avait été lors d'une restitution
 * précédente et ce qui reste chez le collaborateur viennent à part.
 */

type Equipments = NonNullable<NotificationBon['equipments']>;
type Equipment = Equipments[number];

/** Signature la plus récente de la restitution par le collaborateur. */
function latestSignedRestitutionAt(bon: NotificationBon): Date | string | null {
  const signed = (bon.signatures ?? [])
    .filter((s) => s.type === 'restitution' && s.signed && s.signedAt)
    .map((s) => s.signedAt as Date | string)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return signed[0] ?? null;
}

/** Restitution à signer (demande) : tout ce qui a été marqué rendu depuis la
 *  dernière restitution signée. */
export function pendingRestitutionGroups(bon: NotificationBon): RestitutionGroups<Equipment> {
  return groupRestitutionEquipments(bon.equipments ?? [], restitutionWindowUntil(bon.signatures ?? [], null));
}

/** Restitution qui vient d'être signée (confirmation) : la plus récente. */
export function signedRestitutionGroups(bon: NotificationBon): RestitutionGroups<Equipment> {
  const window = restitutionWindowUntil(bon.signatures ?? [], latestSignedRestitutionAt(bon));
  return groupRestitutionEquipments(bon.equipments ?? [], window);
}

/** Bloc titré d'une liste d'équipements, suivi d'une note ; vide sans équipement. */
function equipmentSection(title: string, equipments: readonly Equipment[], note: string): string {
  if (equipments.length === 0) return '';
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#A79F94;text-transform:uppercase;letter-spacing:0.08em">${title} (${equipments.length})</p>
      <div style="background-color:#F6F3EE;border:1px solid #E2DFD9;border-radius:10px;padding:0 20px;margin-bottom:28px">
        <ul style="margin:0;padding:4px 0;list-style:none">${buildEquipList([...equipments])}</ul>
      </div>
      <p style="margin:0 0 28px;font-size:13px;color:#6B665E;line-height:1.6;background:#F6F3EE;border:1px solid #E2DFD9;border-radius:8px;padding:10px 14px">${note}</p>`;
}

/** Équipements rendus lors d'une restitution précédente (vide s'il n'y en a pas). */
export function buildAlreadyReturnedSection(equipments: readonly Equipment[]): string {
  return equipmentSection(
    'Déjà restitués lors d’une restitution précédente',
    equipments,
    'Ces équipements ont déjà été rendus et signés : cette restitution ne les concerne pas.',
  );
}

/** Équipements encore chez le collaborateur (restitution partielle ; vide si complète). */
export function buildRemainingSection(equipments: readonly Equipment[]): string {
  const held = equipments.filter((eq) => !eq.notReturned);
  return equipmentSection(
    'Éléments restants sur ce bon',
    held,
    'Ces équipements ne font pas partie de cette restitution et restent attribués.',
  );
}
