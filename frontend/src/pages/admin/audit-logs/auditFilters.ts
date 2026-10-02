/**
 * Filtres du journal d'audit, gardés dans l'adresse (`?user=…&domain=…`) :
 * recharger la page ou partager le lien redonne exactement la même vue.
 */
import { AUDIT_ACTIONS, AUDIT_ACTION_DOMAINS } from '@/contracts/audit-actions';
import type { AuditAction, AuditActionDomain } from '@/contracts/audit-actions';
import { formatDate } from '@/lib/dates';
import type { ExportFilter } from '@/components/export';
import { isCatalogAction } from './auditEntry';

export interface AuditFilters {
  readonly user: string;
  readonly domain: AuditActionDomain | '';
  readonly action: AuditAction | '';
  readonly dateFrom: string;
  readonly dateTo: string;
}

export const FILTER_KEYS = ['user', 'domain', 'action', 'dateFrom', 'dateTo'] as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDomain(value: string): value is AuditActionDomain {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTION_DOMAINS, value);
}

/** Filtres lus dans l'adresse ; une valeur illisible est ignorée. */
export function readFilters(search: string): AuditFilters {
  const params = new URLSearchParams(search);
  const domain = params.get('domain') ?? '';
  const action = params.get('action') ?? '';
  const day = (name: string) => {
    const value = params.get(name) ?? '';
    return ISO_DAY.test(value) ? value : '';
  };
  return {
    user: (params.get('user') ?? '').trim(),
    domain: isDomain(domain) ? domain : '',
    action: isCatalogAction(action) ? action : '',
    dateFrom: day('dateFrom'),
    dateTo: day('dateTo'),
  };
}

/** Paramètres de requête communs à la liste et à l'export : l'export reprend
 *  exactement ce que l'écran affiche. */
export function filterQuery(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return params;
}

/** Actions du catalogue encore écrites, groupées par famille, dans l'ordre des familles. */
export function actionsByDomain(domain: AuditActionDomain | ''): { domain: AuditActionDomain; actions: AuditAction[] }[] {
  const domains = (Object.keys(AUDIT_ACTION_DOMAINS) as AuditActionDomain[]).filter((d) => !domain || d === domain);
  const all = Object.keys(AUDIT_ACTIONS) as AuditAction[];
  return domains
    .map((d) => ({ domain: d, actions: all.filter((a) => AUDIT_ACTIONS[a].domain === d && !('legacy' in AUDIT_ACTIONS[a])) }))
    .filter((group) => group.actions.length > 0);
}

/** Filtres actifs en mots d'écran, pour l'annonce avant l'export. */
export function exportFilters(filters: AuditFilters): ExportFilter[] {
  return [
    { label: 'Auteur', value: filters.user },
    { label: 'Famille', value: filters.domain ? AUDIT_ACTION_DOMAINS[filters.domain] : '' },
    { label: 'Action', value: filters.action ? AUDIT_ACTIONS[filters.action].label : '' },
    { label: 'Du', value: filters.dateFrom ? formatDate(filters.dateFrom) : '' },
    { label: 'Au', value: filters.dateTo ? formatDate(filters.dateTo) : '' },
  ].filter((filter) => filter.value !== '');
}
