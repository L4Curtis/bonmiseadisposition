import { describe, it, expect } from 'vitest';
import { DEFAULT_LIST_QUERY } from '../bonsListQuery';
import { bonsExportFilters } from '../exportFilters';
import { IN_PROGRESS_EXCLUDE } from '../statusFilterOptions';

const CONTEXT = {
  filiales: [{ id: 'f1', displayName: 'Bâtir Nord' }] as never[],
  creators: [{ id: 'u2', displayName: 'Julie Moreau' }],
  currentUserId: 'u1',
};

describe('filtres de la liste annoncés avant l’export', () => {
  it('aucun filtre : rien à annoncer', () => {
    expect(bonsExportFilters(DEFAULT_LIST_QUERY, CONTEXT)).toEqual([]);
  });

  it('nomme chaque filtre en mots d’écran, jamais avec un code', () => {
    const filters = bonsExportFilters({
      ...DEFAULT_LIST_QUERY,
      search: 'Dell',
      status: 'active',
      filialeId: 'f1',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      createdById: 'u2',
      overdue: true,
      closedFrom: '2026-09-01',
    }, CONTEXT);
    expect(filters).toEqual([
      { label: 'Recherche', value: '« Dell »' },
      { label: 'Statut', value: 'En cours' },
      { label: 'Filiale', value: 'Bâtir Nord' },
      { label: 'Mis à disposition', value: 'du 01/09/2026 au 30/09/2026' },
      { label: 'Créé par', value: 'Julie Moreau' },
      { label: 'Signature en retard', value: 'oui' },
      { label: 'Filtre', value: 'Clôturés depuis le 01/09/2026' },
    ]);
  });

  it('l’option « En cours » des statuts est nommée comme dans le sélecteur', () => {
    expect(bonsExportFilters({ ...DEFAULT_LIST_QUERY, excludeStatus: IN_PROGRESS_EXCLUDE }, CONTEXT)).toEqual([
      { label: 'Statut', value: 'Tous sauf clôturés et annulés' },
    ]);
  });
});
