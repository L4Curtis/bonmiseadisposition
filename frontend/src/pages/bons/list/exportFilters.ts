import type { ExportFilter } from '@/components/export';
import { BON_SUB_STATUS_LABELS } from '@/domain/labels';
import type { Filiale } from '@/types';
import { activeFilterChips } from './ActiveFilterChips';
import type { BonsListQuery } from './bonsListQuery';
import { IN_PROGRESS_EXCLUDE, IN_PROGRESS_OPTION_VALUE, STATUS_OPTIONS } from './statusFilterOptions';
import type { BonCreator } from './useBonCreators';

/** Ce qu'il faut pour nommer les filtres (noms des filiales et des créateurs). */
export interface ExportFilterContext {
  readonly filiales: readonly Filiale[];
  readonly creators: readonly BonCreator[];
  readonly currentUserId: string | undefined;
}

/** « 2026-09-01 » → « 01/09/2026 ». */
function frenchDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

/** Option « En cours » du sélecteur : pilotée par les statuts exclus. */
function isInProgressOption(query: BonsListQuery): boolean {
  return !query.status && query.excludeStatus === IN_PROGRESS_EXCLUDE;
}

function statusLabel(query: BonsListQuery): string | null {
  const value = isInProgressOption(query) ? IN_PROGRESS_OPTION_VALUE : query.status;
  if (!value) return null;
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function creatorLabel(query: BonsListQuery, context: ExportFilterContext): string {
  if (query.createdById === context.currentUserId) return 'Moi';
  return context.creators.find((c) => c.id === query.createdById)?.displayName ?? 'Un autre compte';
}

function handoverPeriod(query: BonsListQuery): string | null {
  if (!query.dateFrom && !query.dateTo) return null;
  if (query.dateFrom && query.dateTo) return `du ${frenchDay(query.dateFrom)} au ${frenchDay(query.dateTo)}`;
  return query.dateFrom ? `depuis le ${frenchDay(query.dateFrom)}` : `jusqu’au ${frenchDay(query.dateTo)}`;
}

/** Filtres actifs de la liste, en mots d'écran, pour l'annonce de l'export
 *  (« Statut : En cours ; Filiale : Bâtir Nord »). Les pastilles (référence,
 *  périodes du tableau de bord, exclusions) reprennent leur propre libellé. */
export function bonsExportFilters(query: BonsListQuery, context: ExportFilterContext): ExportFilter[] {
  const filters: ExportFilter[] = [];
  const add = (label: string, value: string | null | false) => {
    if (value) filters.push({ label, value });
  };
  add('Recherche', query.search && `« ${query.search} »`);
  add('Statut', statusLabel(query));
  add('Filiale', query.filialeId && (context.filiales.find((f) => f.id === query.filialeId)?.displayName ?? 'filiale choisie'));
  add('Mis à disposition', handoverPeriod(query));
  add('Créé par', query.createdById && creatorLabel(query, context));
  add('Étape de la restitution', query.subStatus && (BON_SUB_STATUS_LABELS[query.subStatus as keyof typeof BON_SUB_STATUS_LABELS] ?? query.subStatus));
  add('Signature en retard', query.overdue && 'oui');
  add('Signature attendue', query.awaitingSignature && 'oui');
  add('Lien expiré', query.linkExpired && 'oui');
  add('Sans date de restitution prévue', query.noReturnDate && 'oui');
  for (const chip of activeFilterChips(query, Boolean(query.excludeStatus) && !isInProgressOption(query))) {
    filters.push({ label: 'Filtre', value: chip.label });
  }
  return filters;
}
