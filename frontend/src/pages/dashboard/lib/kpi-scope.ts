/**
 * Mots communs aux cartes du tableau de bord : ce qu'un chiffre compte (unité
 * au singulier ou au pluriel) et sur quoi il porte (« au 25/09 » pour un état
 * du jour, « du 27/08 au 25/09 » pour un flux sur la période). Fonctions pures.
 */

import { todayInParis } from '@/lib/dates';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const numberFormatter = new Intl.NumberFormat('fr-FR');
const dayMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

/** Unité d'un compteur : `[singulier, pluriel]`. */
export type Unit = readonly [string, string];

export const UNITS = {
  bons: ['bon', 'bons'],
  equipments: ['équipement', 'équipements'],
  collaborateurs: ['collaborateur', 'collaborateurs'],
  contestations: ['contestation', 'contestations'],
  documents: ['document', 'documents'],
  emails: ['email', 'emails'],
  signatures: ['signature', 'signatures'],
  rappels: ['rappel', 'rappels'],
  pv: ['PV', 'PV'],
} as const satisfies Record<string, Unit>;

/** Mot de l'unité accordé au nombre (« 1 bon », « 0 bon », « 6 bons »). */
export function unitWord(count: number | null | undefined, unit: Unit): string {
  return (count ?? 0) > 1 ? unit[1] : unit[0];
}

/** « 6 équipements », « 1 bon ». */
export function countWithUnit(count: number, unit: Unit): string {
  return `${numberFormatter.format(count)} ${unitWord(count, unit)}`;
}

/** « 25/09 » pour une date AAAA-MM-JJ (civile) ou une date-heure ISO. */
export function shortDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return dayMonth.format(date);
}

/** Portée d'un état du jour : « au 25/09 ». */
export function asOfLabel(asOf: string): string {
  return `au ${shortDate(asOf)}`;
}

/** Portée d'un flux : « du 27/08 au 25/09 ». */
export function periodLabel(period: { from: string; to: string }): string {
  return `du ${shortDate(period.from)} au ${shortDate(period.to)}`;
}

function isoDayToUtc(isoDay: string): number {
  const [y, m, d] = isoDay.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Jours civils (Paris) entre une date et aujourd'hui ; négatif si à venir. */
export function daysFromToday(value: string): number {
  const isoDay = /^\d{4}-\d{2}-\d{2}/.test(value) && value.length === 10
    ? value
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(value));
  return Math.round((isoDayToUtc(todayInParis()) - isoDayToUtc(isoDay)) / MS_PER_DAY);
}

/**
 * Ancienneté lisible d'une date : « aujourd'hui », « il y a 12 j », et pour
 * une date à venir (remise prévue, retour prévu) « prévu le 28/09 » — jamais
 * « il y a -3 j ».
 */
export function ageLabel(value: string): string {
  const days = daysFromToday(value);
  if (days < 0) return `prévu le ${shortDate(value)}`;
  if (days === 0) return "aujourd'hui";
  return `il y a ${days} j`;
}

/** « depuis 12 j » (durée d'une situation), « depuis aujourd'hui ». */
export function sinceLabel(value: string): string {
  const days = Math.max(0, daysFromToday(value));
  return days === 0 ? "depuis aujourd'hui" : `depuis ${days} j`;
}
