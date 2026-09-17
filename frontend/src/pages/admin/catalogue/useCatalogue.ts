import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { buildAddItemPayload, buildRemoveItemPayload, buildUpdateQuantityPayload } from './lib/packItems';
import type { CatalogItem, CatalogItemFormValues, DeleteTarget, Pack, RemovePackItemTarget } from './types';

interface UseCatalogueResult {
  items: CatalogItem[];
  packs: Pack[];
  loading: boolean;
  loadError: string | null;
  tab: 'catalogue' | 'packs';
  setTab: (tab: 'catalogue' | 'packs') => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  expandedPack: string | null;
  setExpandedPack: (id: string | null) => void;
  newPackName: string;
  setNewPackName: (v: string) => void;
  deleteTarget: DeleteTarget | null;
  setDeleteTarget: (t: DeleteTarget | null) => void;
  removePackItemTarget: RemovePackItemTarget | null;
  setRemovePackItemTarget: (t: RemovePackItemTarget | null) => void;
  pendingPackId: string | null;
  fetchData: () => Promise<void>;
  createItem: (data: CatalogItemFormValues) => Promise<boolean>;
  updateItem: (id: string, data: CatalogItemFormValues) => Promise<boolean>;
  reactivateItem: (item: CatalogItem) => Promise<void>;
  reactivatePack: (pack: Pack) => Promise<void>;
  confirmDelete: () => Promise<void>;
  createPack: () => Promise<void>;
  addItemToPack: (pack: Pack, catalogItem: CatalogItem, quantity: number) => Promise<void>;
  removeItemFromPack: (pack: Pack, catalogItemId: string) => Promise<void>;
  confirmRemovePackItem: () => Promise<void>;
  updateItemQty: (pack: Pack, catalogItemId: string, quantity: number) => Promise<void>;
}

/** Chargement, recherche et CRUD du catalogue d'equipements et des packs
 *  (creation/edition/desactivation d'equipements, creation/desactivation de
 *  packs, ajout/retrait/quantite des equipements d'un pack). */
export function useCatalogue(): UseCatalogueResult {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'catalogue' | 'packs'>('catalogue');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [newPackName, setNewPackName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [removePackItemTarget, setRemovePackItemTarget] = useState<RemovePackItemTarget | null>(null);
  // Pack en cours de modification (ajout/retrait/quantité) — désactive ses
  // boutons +/- pendant la requête pour éviter une closure périmée en cas de
  // clics rapprochés (le PUT remplace toute la liste d'items du pack).
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [catalogData, packsData] = await Promise.all([
        api.get<CatalogItem[]>('/equipment/catalog'),
        api.get<Pack[]>('/equipment/packs'),
      ]);
      setItems(catalogData);
      setPacks(packsData);
      setLoadError(null);
    } catch (e: unknown) {
      setLoadError(errorMessage(e, 'Erreur lors du chargement du catalogue'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const createItem = async (data: CatalogItemFormValues): Promise<boolean> => {
    try {
      await api.post('/equipment/catalog', data);
      toast({ title: 'Equipement ajoute au catalogue', variant: 'success' });
      setCreating(false);
      await fetchData();
      return true;
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'ajout");
      return false;
    }
  };

  const updateItem = async (id: string, data: CatalogItemFormValues): Promise<boolean> => {
    try {
      await api.put(`/equipment/catalog/${id}`, data);
      toast({ title: 'Equipement mis a jour', variant: 'success' });
      setEditingId(null);
      await fetchData();
      return true;
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la mise a jour');
      return false;
    }
  };

  const reactivateItem = async (item: CatalogItem) => {
    try {
      await api.put(`/equipment/catalog/${item.id}`, { active: true });
      toast({ title: 'Equipement réactivé', variant: 'success' });
      await fetchData();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la réactivation');
    }
  };

  const reactivatePack = async (pack: Pack) => {
    try {
      await api.put(`/equipment/packs/${pack.id}`, { active: true });
      toast({ title: 'Pack réactivé', variant: 'success' });
      await fetchData();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la réactivation');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'item') {
        await api.delete(`/equipment/catalog/${deleteTarget.id}`);
        toast({ title: 'Equipement desactive', variant: 'success' });
      } else {
        await api.delete(`/equipment/packs/${deleteTarget.id}`);
        toast({ title: 'Pack desactive', variant: 'success' });
      }
      await fetchData();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la desactivation');
    } finally {
      setDeleteTarget(null);
    }
  };

  const createPack = async () => {
    if (!newPackName.trim()) {
      toast({ title: 'Veuillez saisir un nom pour le pack', variant: 'destructive' });
      return;
    }
    try {
      await api.post('/equipment/packs', { name: newPackName.trim() });
      toast({ title: 'Pack cree', variant: 'success' });
      setNewPackName('');
      await fetchData();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la creation du pack');
    }
  };

  const addItemToPack = async (pack: Pack, catalogItem: CatalogItem, quantity: number) => {
    const current = packs.find((p) => p.id === pack.id) ?? pack;
    const newItems = buildAddItemPayload(current.items, catalogItem.id, quantity);
    setPendingPackId(pack.id);
    try {
      await api.put(`/equipment/packs/${pack.id}`, { items: newItems });
      await fetchData();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'ajout de l'équipement au pack");
    } finally {
      setPendingPackId(null);
    }
  };

  const removeItemFromPack = async (pack: Pack, catalogItemId: string) => {
    const current = packs.find((p) => p.id === pack.id) ?? pack;
    const newItems = buildRemoveItemPayload(current.items, catalogItemId);
    setPendingPackId(pack.id);
    try {
      await api.put(`/equipment/packs/${pack.id}`, { items: newItems });
      await fetchData();
    } catch (e: unknown) {
      showActionError(e, "Erreur lors du retrait de l'équipement");
    } finally {
      setPendingPackId(null);
    }
  };

  const confirmRemovePackItem = async () => {
    if (!removePackItemTarget) return;
    const { pack, catalogItemId } = removePackItemTarget;
    setRemovePackItemTarget(null);
    await removeItemFromPack(pack, catalogItemId);
  };

  const updateItemQty = async (pack: Pack, catalogItemId: string, quantity: number) => {
    if (quantity < 1) return;
    const current = packs.find((p) => p.id === pack.id) ?? pack;
    const newItems = buildUpdateQuantityPayload(current.items, catalogItemId, quantity);
    setPendingPackId(pack.id);
    try {
      await api.put(`/equipment/packs/${pack.id}`, { items: newItems });
      await fetchData();
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la mise à jour de la quantité');
    } finally {
      setPendingPackId(null);
    }
  };

  return {
    items, packs, loading, loadError,
    tab, setTab,
    creating, setCreating,
    editingId, setEditingId,
    expandedPack, setExpandedPack,
    newPackName, setNewPackName,
    deleteTarget, setDeleteTarget,
    removePackItemTarget, setRemovePackItemTarget,
    pendingPackId,
    fetchData, createItem, updateItem, reactivateItem, reactivatePack,
    confirmDelete, createPack, addItemToPack, removeItemFromPack,
    confirmRemovePackItem, updateItemQty,
  };
}
