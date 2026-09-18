import { useState } from 'react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { CatalogItem, CatalogItemFormValues } from './types';

export interface UseCatalogueItemsResult {
  items: CatalogItem[];
  setItems: (items: CatalogItem[]) => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  pendingItemId: string | null;
  reloadCatalog: () => Promise<void>;
  createItem: (data: CatalogItemFormValues) => Promise<boolean>;
  updateItem: (id: string, data: CatalogItemFormValues) => Promise<boolean>;
  reactivateItem: (item: CatalogItem) => Promise<void>;
  deactivateItem: (id: string) => Promise<void>;
}

/** État et CRUD des équipements du catalogue (hors packs, voir
 *  {@link ../useCataloguePacks}). Chaque mutation met à jour la liste locale
 *  à partir de la réponse de l'API plutôt que de tout recharger. */
export function useCatalogueItems(): UseCatalogueItemsResult {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  const upsertItem = (item: CatalogItem): void => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  };

  /** Recharge uniquement le catalogue — utilisé après un import CSV, dont la
   *  réponse ne décrit pas individuellement chaque équipement créé/réactivé. */
  const reloadCatalog = async (): Promise<void> => {
    try {
      const data = await api.get<CatalogItem[]>('/equipment/catalog');
      setItems(data);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors du rechargement du catalogue');
    }
  };

  const createItem = async (data: CatalogItemFormValues): Promise<boolean> => {
    try {
      const created = await api.post<CatalogItem>('/equipment/catalog', data);
      upsertItem(created);
      toast({ title: 'Équipement ajouté au catalogue', variant: 'success' });
      setCreating(false);
      return true;
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'ajout");
      return false;
    }
  };

  const updateItem = async (id: string, data: CatalogItemFormValues): Promise<boolean> => {
    try {
      const updated = await api.put<CatalogItem>(`/equipment/catalog/${id}`, data);
      upsertItem(updated);
      toast({ title: 'Équipement mis à jour', variant: 'success' });
      setEditingId(null);
      return true;
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la mise à jour');
      return false;
    }
  };

  const reactivateItem = async (item: CatalogItem): Promise<void> => {
    setPendingItemId(item.id);
    try {
      const updated = await api.put<CatalogItem>(`/equipment/catalog/${item.id}`, { active: true });
      upsertItem(updated);
      toast({ title: 'Équipement réactivé', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la réactivation');
    } finally {
      setPendingItemId(null);
    }
  };

  const deactivateItem = async (id: string): Promise<void> => {
    setPendingItemId(id);
    try {
      const updated = await api.delete<CatalogItem>(`/equipment/catalog/${id}`);
      upsertItem(updated);
      toast({ title: 'Équipement désactivé', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la désactivation');
    } finally {
      setPendingItemId(null);
    }
  };

  return {
    items,
    setItems,
    creating,
    setCreating,
    editingId,
    setEditingId,
    pendingItemId,
    reloadCatalog,
    createItem,
    updateItem,
    reactivateItem,
    deactivateItem,
  };
}
