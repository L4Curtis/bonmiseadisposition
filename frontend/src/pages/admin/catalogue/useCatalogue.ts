import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useCatalogueItems } from './useCatalogueItems';
import { useCataloguePacks } from './useCataloguePacks';
import type { CatalogItem, DeactivateTarget, Pack } from './types';

/** Hook composite de la page Catalogue : charge le catalogue et les packs au
 *  montage, et orchestre la désactivation (même boîte de dialogue pour un
 *  équipement ou un pack). Le CRUD détaillé vit dans {@link useCatalogueItems}
 *  et {@link useCataloguePacks} — chaque mutation y met à jour l'état local à
 *  partir de la réponse de l'API plutôt que de tout recharger ; seul l'import
 *  CSV en masse recharge le catalogue seul (jamais les packs), car sa réponse
 *  ne décrit pas individuellement chaque équipement créé/réactivé. */
export function useCatalogue() {
  const itemsApi = useCatalogueItems();
  const packsApi = useCataloguePacks();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'catalogue' | 'packs'>('catalogue');
  const [deactivateTarget, setDeactivateTarget] = useState<DeactivateTarget | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const fetchData = async (): Promise<void> => {
    try {
      const [catalogData, packsData] = await Promise.all([
        api.get<CatalogItem[]>('/equipment/catalog'),
        api.get<Pack[]>('/equipment/packs'),
      ]);
      itemsApi.setItems(catalogData);
      packsApi.setPacks(packsData);
      setLoadError(null);
    } catch (e: unknown) {
      setLoadError(errorMessage(e, 'Erreur lors du chargement du catalogue'));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial unique ; fetchData est recréée à chaque rendu et n'utilise que des setters stables.
  useEffect(() => { fetchData(); }, []);

  const confirmDeactivate = async (): Promise<void> => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      if (deactivateTarget.type === 'item') {
        await itemsApi.deactivateItem(deactivateTarget.id);
      } else {
        await packsApi.deactivatePack(deactivateTarget.id);
      }
    } finally {
      setDeactivating(false);
      setDeactivateTarget(null);
    }
  };

  return {
    items: itemsApi.items,
    packs: packsApi.packs,
    loading,
    loadError,
    tab,
    setTab,
    creating: itemsApi.creating,
    setCreating: itemsApi.setCreating,
    editingId: itemsApi.editingId,
    setEditingId: itemsApi.setEditingId,
    expandedPack: packsApi.expandedPack,
    setExpandedPack: packsApi.setExpandedPack,
    newPackName: packsApi.newPackName,
    setNewPackName: packsApi.setNewPackName,
    deactivateTarget,
    setDeactivateTarget,
    deactivating,
    removePackItemTarget: packsApi.removePackItemTarget,
    setRemovePackItemTarget: packsApi.setRemovePackItemTarget,
    removingPackItem: packsApi.removingPackItem,
    duplicateTarget: packsApi.duplicateTarget,
    setDuplicateTarget: packsApi.setDuplicateTarget,
    duplicateName: packsApi.duplicateName,
    setDuplicateName: packsApi.setDuplicateName,
    duplicating: packsApi.duplicating,
    pendingPackId: packsApi.pendingPackId,
    pendingItemId: itemsApi.pendingItemId,
    fetchData,
    reloadCatalog: itemsApi.reloadCatalog,
    createItem: itemsApi.createItem,
    updateItem: itemsApi.updateItem,
    reactivateItem: itemsApi.reactivateItem,
    reactivatePack: packsApi.reactivatePack,
    confirmDeactivate,
    createPack: packsApi.createPack,
    addItemToPack: packsApi.addItemToPack,
    removeItemFromPack: packsApi.removeItemFromPack,
    confirmRemovePackItem: packsApi.confirmRemovePackItem,
    updateItemQty: packsApi.updateItemQty,
    confirmDuplicate: packsApi.confirmDuplicate,
  };
}
