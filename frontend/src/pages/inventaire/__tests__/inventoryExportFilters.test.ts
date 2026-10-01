import { describe, it, expect } from 'vitest';
import { inventoryExportFilters } from '../inventoryExportFilters';
import type { InventoryBaseFilters } from '../inventoryFilterParams';

const NONE: InventoryBaseFilters = {
  filialeFilter: '', categoryFilter: '', situationFilter: '', search: '', overdueFilter: false,
  missingSerialFilter: false, offCatalogFilter: false,
};

const NAMES = {
  filiales: [{ id: 'f1', displayName: 'Paris' }],
  categories: [{ category: 'pc_portable' as const, label: 'PC portable', count: 3 }],
  situations: [{ situation: 'en_circulation' as const, label: 'En cours', count: 3 }],
};

describe('inventoryExportFilters', () => {
  it('aucun filtre actif : liste vide', () => {
    expect(inventoryExportFilters(NONE, NAMES)).toEqual([]);
  });

  it('chaque filtre en mots d’écran, jamais une clé technique', () => {
    const filters = inventoryExportFilters({
      filialeFilter: 'f1', categoryFilter: 'pc_portable', situationFilter: 'en_circulation', search: 'Dell',
      overdueFilter: true, missingSerialFilter: true, offCatalogFilter: true,
    }, NAMES);

    expect(filters).toEqual([
      { label: 'Filiale', value: 'Paris' },
      { label: 'Catégorie', value: 'PC portable' },
      { label: 'Situation', value: 'En cours' },
      { label: 'Recherche', value: '« Dell »' },
      { label: 'Retour en retard', value: 'oui' },
      { label: 'Sans numéro de série', value: 'oui' },
      { label: 'Hors catalogue', value: 'oui' },
    ]);
  });

  it('« Non restitué » nommé même hors des situations du parc', () => {
    expect(inventoryExportFilters({ ...NONE, situationFilter: 'non_restitue' }, NAMES))
      .toEqual([{ label: 'Situation', value: 'Non restitué' }]);
  });
});
