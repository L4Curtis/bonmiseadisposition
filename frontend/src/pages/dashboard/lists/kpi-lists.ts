/**
 * Listes des chiffres « sur la période » (onglets Délais et Incidents) :
 * `GET /kpi/liste?indicateur=…` rend exactement ce que la carte compte, pour
 * la même période et la même filiale (backend/src/kpi/lists). La liste
 * s'ouvre dans le tableau de bord, par le paramètre d'adresse `liste` : le
 * lien se partage, le bouton retour la referme. Réservé à l'IT : chaque
 * ligne mène à un bon.
 */
import type { KpiListKey } from '@/contracts/kpi';
import { UNITS, type Unit } from '../lib/kpi-scope';

export type { KpiListItem, KpiListKey, KpiListResponse } from '@/contracts/kpi';

/** Paramètre d'adresse qui ouvre la liste d'un chiffre. */
export const LIST_PARAM = 'liste';

interface KpiListMeta {
  /** Titre de la liste, celui de la carte. */
  title: string;
  /** Ce que compte chaque ligne. */
  unit: Unit;
  /** Ce que donne la date de chaque ligne. */
  dateLabel: string;
}

export const KPI_LISTS: Record<KpiListKey, KpiListMeta> = {
  bons_crees: { title: 'Bons créés', unit: UNITS.bons, dateLabel: 'créé le' },
  bons_envoyes: { title: 'Bons envoyés', unit: UNITS.bons, dateLabel: 'premier envoi le' },
  bons_clotures: { title: 'Bons clôturés', unit: UNITS.bons, dateLabel: 'clôturé le' },
  bons_annules: { title: 'Bons annulés', unit: UNITS.bons, dateLabel: 'annulé le' },
  pv_emis: { title: 'PV de non-restitution émis', unit: UNITS.pv, dateLabel: 'émis le' },
  remises_sans_signature: { title: 'Remises constatées sans signature', unit: UNITS.bons, dateLabel: 'constatée le' },
  clotures_sans_signature: { title: 'Clôturés sans signature', unit: UNITS.bons, dateLabel: 'clôturé le' },
  contestations_recues: { title: 'Contestations reçues', unit: UNITS.contestations, dateLabel: 'reçue le' },
  contestations_fondees: { title: 'Contestations fondées', unit: UNITS.contestations, dateLabel: 'tranchée le' },
  contestations_non_retenues: { title: 'Contestations non retenues', unit: UNITS.contestations, dateLabel: 'tranchée le' },
  emails_en_echec: { title: 'Emails en échec', unit: UNITS.emails, dateLabel: 'tenté le' },
  signatures_a_distance: { title: 'Documents signés à distance, par le lien reçu', unit: UNITS.signatures, dateLabel: 'signé le' },
  signatures_sur_place: { title: 'Documents signés sur place, devant le technicien', unit: UNITS.signatures, dateLabel: 'signé le' },
  signatures_mandatees: { title: 'Documents signés par une personne mandatée', unit: UNITS.signatures, dateLabel: 'signé le' },
};

export function isKpiListKey(value: string | null): value is KpiListKey {
  return value !== null && Object.prototype.hasOwnProperty.call(KPI_LISTS, value);
}

/** Adresse qui ouvre la liste `key` en gardant l'onglet, la période et la filiale. */
export function kpiListHref(key: KpiListKey, current: URLSearchParams): string {
  const next = new URLSearchParams(current);
  next.set(LIST_PARAM, key);
  next.delete('page');
  return `?${next.toString()}`;
}

/** Texte du « ? » d'une carte sans liste, selon la raison. */
export const NO_LIST = {
  /** Direction : chaque ligne d'une liste mène à un bon, et les bons ne lui sont pas ouverts. */
  direction: "La liste de ce chiffre mène aux bons concernés : elle ne s'ouvre pas pour la direction, qui n'accède pas aux bons.",
  /** Part à 100 % ou à 0 % : il n'y a aucun équipement à montrer. */
  allWithSerial: "Tous les équipements chez les collaborateurs ont un numéro de série : il n'y a aucun équipement sans numéro à lister.",
  noneOffCatalog: "Aucun équipement chez les collaborateurs n'est saisi en texte libre : il n'y a rien à lister.",
  /** Médiane des délais de décision. */
  decisionDelay: "Ce chiffre est une médiane calculée sur les contestations tranchées : il n'ouvre pas de liste.",
  /** Flux d'équipements tiré du journal : un même équipement peut être déclaré puis retrouvé plusieurs fois. */
  equipmentFlow:
    "Ce chiffre compte des déclarations passées, pas une liste d'équipements : un équipement peut avoir été déclaré puis retrouvé depuis. La liste des équipements encore non restitués s'ouvre depuis la carte « Encore non restitués ».",
  /** La page Contestations ne se filtre pas par filiale. */
  contestationsByFiliale:
    "La page Contestations ne se filtre pas par filiale : choisissez « Toutes les filiales » pour ouvrir la liste de ce chiffre.",
  /** Médiane, moyenne ou part : pas une liste. */
  statistic: "Ce chiffre est un délai ou une part calculés sur plusieurs bons : il n'ouvre pas de liste.",
} as const;
