import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { Filiale } from '@/types';

/** Chargement + actions CRUD (création, mise à jour, suppression, upload logo/cachet) des filiales. */
export function useFiliales() {
  const [filiales, setFiliales] = useState<Filiale[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Filiale | null>(null);

  const fetchFiliales = async () => {
    try {
      const data = await api.get<Filiale[]>('/filiales');
      setFiliales(data);
      setLoadError(null);
    } catch (e: unknown) {
      setLoadError(errorMessage(e, 'Erreur lors du chargement des filiales'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFiliales(); }, []);

  const create = async (data: Partial<Filiale>): Promise<boolean> => {
    try {
      await api.post('/filiales', data);
      toast({ title: 'Filiale créée', variant: 'success' });
      setCreating(false);
      await fetchFiliales();
      return true;
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la création');
      return false;
    }
  };

  const update = async (id: string, data: Partial<Filiale>): Promise<boolean> => {
    try {
      await api.put(`/filiales/${id}`, data);
      toast({ title: 'Filiale mise à jour', variant: 'success' });
      setEditingId(null);
      await fetchFiliales();
      return true;
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la mise à jour');
      return false;
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/filiales/${deleteTarget.id}`);
      toast({ title: 'Filiale supprimée', variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la suppression');
    } finally {
      setDeleteTarget(null);
      fetchFiliales();
    }
  };

  const uploadFile = async (id: string, type: 'logo' | 'stamp', file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      await api.patchForm(`/filiales/${id}/${type}`, form);
      toast({ title: `${type === 'logo' ? 'Logo' : 'Cachet'} mis à jour`, variant: 'success' });
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'upload");
    }
    fetchFiliales();
  };

  return {
    filiales,
    loading,
    loadError,
    fetchFiliales,
    creating,
    setCreating,
    editingId,
    setEditingId,
    deleteTarget,
    setDeleteTarget,
    create,
    update,
    remove,
    uploadFile,
  };
}
