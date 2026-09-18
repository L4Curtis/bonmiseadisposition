import { useState } from 'react';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { buildAddItemPayload, buildRemoveItemPayload, buildUpdateQuantityPayload } from './lib/packItems';
import type { CatalogItem, Pack, RemovePackItemTarget } from './types';

function sortPacksByName(packs: Pack[]): Pack[] {
  return [...packs].sort((a, b) => a.name.localeCompare(b.name));
}

export interface UseCataloguePacksResult {
  packs: Pack[];
  setPacks: (packs: Pack[]) => void;
  expandedPack: string | null;
  setExpandedPack: (id: string | null) => void;
  newPackName: string;
  setNewPackName: (v: string) => void;
  pendingPackId: string | null;
  removePackItemTarget: RemovePackItemTarget | null;
  setRemovePackItemTarget: (t: RemovePackItemTarget | null) => void;
  removingPackItem: boolean;
  duplicateTarget: Pack | null;
  setDuplicateTarget: (pack: Pack | null) => void;
  duplicateName: string;
  setDuplicateName: (v: string) => void;
  duplicating: boolean;
  createPack: () => Promise<void>;
  reactivatePack: (pack: Pack) => Promise<void>;
  deactivatePack: (id: string) => Promise<void>;
  addItemToPack: (pack: Pack, catalogItem: CatalogItem, quantity: number) => Promise<void>;
  removeItemFromPack: (pack: Pack, catalogItemId: string) => Promise<void>;
  confirmRemovePackItem: () => Promise<void>;
  updateItemQty: (pack: Pack, catalogItemId: string, quantity: number) => Promise<void>;
  confirmDuplicate: () => Promise<void>;
}

/** État et CRUD des packs (création/désactivation/duplication, et gestion des
 *  équipements qui les composent). Un PUT sur un pack renvoie toujours le
 *  pack complet avec ses items : chaque mutation remplace localement l'entrée
 *  correspondante plutôt que de tout recharger. */
export function useCataloguePacks(): UseCataloguePacksResult {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [newPackName, setNewPackName] = useState('');
  const [removePackItemTarget, setRemovePackItemTarget] = useState<RemovePackItemTarget | null>(null);
  const [removingPackItem, setRemovingPackItem] = useState(false);
  const [duplicateTargetState, setDuplicateTargetState] = useState<Pack | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  // Pack en cours de modification — désactive ses boutons d'action pendant la
  // requête pour éviter un double-clic (closure périmée en cas de clics
  // rapprochés, le PUT remplace toute la liste d'items du pack).
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);

  const upsertPack = (pack: Pack): void => {
    setPacks((prev) => {
      const idx = prev.findIndex((p) => p.id === pack.id);
      if (idx === -1) return sortPacksByName([...prev, pack]);
      const next = [...prev];
      next[idx] = pack;
      return next;
    });
  };

  const createPack = async (): Promise<void> => {
    if (!newPackName.trim()) {
      toast({ title: 'Veuillez saisir un nom pour le pack', variant: 'destructive' });
      return;
    }
    try {
      const created = await api.post<Pack>('/equipment/packs', { name: newPackName.trim() });
      setPacks((prev) => sortPacksByName([...prev, created]));
      toast({ title: 'Pack créé', variant: 'success' });
      setNewPackName('');
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la création du pack');
    }
  };

  const reactivatePack = async (pack: Pack): Promise<void> => {
    setPendingPackId(pack.id);
    try {
      const updated = await api.put<Pack>(`/equipment/packs/${pack.id}`, { active: true });
      upsertPack(updated);
      toast({ title: 'Pack réactivé', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la réactivation');
    } finally {
      setPendingPackId(null);
    }
  };

  const deactivatePack = async (id: string): Promise<void> => {
    setPendingPackId(id);
    try {
      // DELETE /equipment/packs/:id ne renvoie pas les items du pack
      // (contrairement au PUT) : on ne fusionne donc que les champs
      // scalaires retournés, en conservant les items déjà connus localement
      // plutôt que de tout recharger.
      const updated = await api.delete<Pack>(`/equipment/packs/${id}`);
      setPacks((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated, items: p.items } : p)));
      toast({ title: 'Pack désactivé', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la désactivation');
    } finally {
      setPendingPackId(null);
    }
  };

  const addItemToPack = async (pack: Pack, catalogItem: CatalogItem, quantity: number): Promise<void> => {
    const current = packs.find((p) => p.id === pack.id) ?? pack;
    const newItems = buildAddItemPayload(current.items, catalogItem.id, quantity);
    setPendingPackId(pack.id);
    try {
      const updated = await api.put<Pack>(`/equipment/packs/${pack.id}`, { items: newItems });
      upsertPack(updated);
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'ajout de l'équipement au pack");
    } finally {
      setPendingPackId(null);
    }
  };

  const removeItemFromPack = async (pack: Pack, catalogItemId: string): Promise<void> => {
    const current = packs.find((p) => p.id === pack.id) ?? pack;
    const newItems = buildRemoveItemPayload(current.items, catalogItemId);
    setPendingPackId(pack.id);
    try {
      const updated = await api.put<Pack>(`/equipment/packs/${pack.id}`, { items: newItems });
      upsertPack(updated);
    } catch (e: unknown) {
      showActionError(e, "Erreur lors du retrait de l'équipement");
    } finally {
      setPendingPackId(null);
    }
  };

  const confirmRemovePackItem = async (): Promise<void> => {
    if (!removePackItemTarget) return;
    const { pack, catalogItemId } = removePackItemTarget;
    setRemovingPackItem(true);
    setRemovePackItemTarget(null);
    await removeItemFromPack(pack, catalogItemId);
    setRemovingPackItem(false);
  };

  const updateItemQty = async (pack: Pack, catalogItemId: string, quantity: number): Promise<void> => {
    if (quantity < 1) return;
    const current = packs.find((p) => p.id === pack.id) ?? pack;
    const newItems = buildUpdateQuantityPayload(current.items, catalogItemId, quantity);
    setPendingPackId(pack.id);
    try {
      const updated = await api.put<Pack>(`/equipment/packs/${pack.id}`, { items: newItems });
      upsertPack(updated);
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la mise à jour de la quantité');
    } finally {
      setPendingPackId(null);
    }
  };

  const setDuplicateTarget = (pack: Pack | null): void => {
    setDuplicateTargetState(pack);
    setDuplicateName(pack ? `${pack.name} (copie)` : '');
  };

  const confirmDuplicate = async (): Promise<void> => {
    if (!duplicateTargetState) return;
    const name = duplicateName.trim();
    if (!name) {
      toast({ title: 'Veuillez saisir un nom pour le pack', variant: 'destructive' });
      return;
    }
    setDuplicating(true);
    try {
      const duplicatedItems = duplicateTargetState.items.map((i) => ({
        catalogItemId: i.catalogItem.id,
        quantity: i.quantity,
        order: i.order,
      }));
      const created = await api.post<Pack>('/equipment/packs', { name, items: duplicatedItems });
      setPacks((prev) => sortPacksByName([...prev, created]));
      toast({ title: 'Pack dupliqué', variant: 'success' });
      setDuplicateTargetState(null);
      setDuplicateName('');
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la duplication du pack');
    } finally {
      setDuplicating(false);
    }
  };

  return {
    packs,
    setPacks,
    expandedPack,
    setExpandedPack,
    newPackName,
    setNewPackName,
    pendingPackId,
    removePackItemTarget,
    setRemovePackItemTarget,
    removingPackItem,
    duplicateTarget: duplicateTargetState,
    setDuplicateTarget,
    duplicateName,
    setDuplicateName,
    duplicating,
    createPack,
    reactivatePack,
    deactivatePack,
    addItemToPack,
    removeItemFromPack,
    confirmRemovePackItem,
    updateItemQty,
    confirmDuplicate,
  };
}
