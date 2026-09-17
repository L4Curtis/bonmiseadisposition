import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';

type Equipments = NonNullable<NotificationBon['equipments']>;

function equipmentLabel(eq: Equipments[number]): string {
  return eq.catalogItem
    ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
    : escapeHtml(eq.customLabel || 'Équipement');
}

function serialSuffix(eq: Equipments[number]): string {
  return eq.serialNumber
    ? `<span style="color:#A79F94;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
    : '';
}

/** Liste HTML (balises <li>) des équipements d'un bon, triée par ordre d'affichage. */
export function buildEquipList(equipments: Equipments): string {
  const items = (equipments ?? [])
    .sort((a, b) => a.order - b.order)
    .map((eq) => {
      const label = equipmentLabel(eq);
      const serial = serialSuffix(eq);
      return `<li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}</li>`;
    });
  return items.length
    ? items.join('\n')
    : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';
}

/** Liste HTML des équipements marqués non restitués, avec leur motif. */
export function buildNotReturnedList(equipments: Equipments): string {
  const items = (equipments ?? [])
    .filter((eq) => eq.notReturned)
    .sort((a, b) => a.order - b.order)
    .map((eq) => {
      const label = equipmentLabel(eq);
      const serial = serialSuffix(eq);
      const reason = `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${escapeHtml(eq.notReturnedReason ?? 'Motif non précisé')}</span>`;
      return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}${reason}</li>`;
    });
  return items.length
    ? items.join('\n')
    : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le procès-verbal en ligne</li>';
}

/** Liste HTML des équipements encore prêtés (ni restitués, ni signalés non restitués). */
export function buildLoanedEquipList(equipments: Equipments): string {
  const items = (equipments ?? [])
    .filter((eq) => !eq.returnedAt && !eq.notReturned)
    .sort((a, b) => a.order - b.order)
    .map((eq) => {
      const label = equipmentLabel(eq);
      const serial = serialSuffix(eq);
      return `<li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}</li>`;
    });
  return items.length
    ? items.join('\n')
    : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';
}
