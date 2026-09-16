import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Upload, X, Check } from 'lucide-react';
import type { Filiale } from '@/types';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function FilialeForm({
  filiale,
  onSave,
  onCancel,
}: {
  filiale?: Filiale;
  onSave: (data: Partial<Filiale>) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: filiale?.name || '',
    displayName: filiale?.displayName || '',
    address: filiale?.address || '',
    siret: filiale?.siret || '',
    active: filiale?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim() || !form.displayName.trim()) {
      setError('Le nom et le nom d’affichage sont obligatoires');
      return;
    }
    setError('');
    setSaving(true);
    const payload: Partial<Filiale> = {
      name: form.name.trim(),
      displayName: form.displayName.trim(),
      address: form.address,
      siret: form.siret,
    };
    // active n'existe pas sur CreateFilialeDto : uniquement envoyé en édition
    if (filiale) payload.active = form.active;
    const ok = await onSave(payload);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nom officiel (mappage AD)</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Fresse GDO"
          />
        </div>
        <div className="space-y-1">
          <Label>{"Nom d'affichage (sur le bon)"}</Label>
          <Input
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            placeholder="Fresse GDO SAS"
          />
        </div>
        <div className="space-y-1">
          <Label>Adresse</Label>
          <Input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="123 Avenue de la République, 75011 Paris"
          />
        </div>
        <div className="space-y-1">
          <Label>SIRET</Label>
          <Input
            value={form.siret}
            onChange={(e) => setForm((f) => ({ ...f, siret: e.target.value }))}
            placeholder="123 456 789 00012"
          />
        </div>
      </div>
      {filiale && (
        <div className="flex items-center gap-3">
          <Toggle checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          <Label className="cursor-pointer select-none" onClick={() => setForm((f) => ({ ...f, active: !f.active }))}>
            Active
          </Label>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving || saved}
          className={saved ? 'bg-green-600 hover:bg-green-600 text-white' : ''}
          onClick={handleSave}
        >
          {saved ? <Check className="h-3 w-3" /> : null}
          {saved ? 'Enregistré' : saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="h-3 w-3" /> Annuler
        </Button>
      </div>
    </div>
  );
}

function FileUploadButton({
  label,
  onUpload,
}: {
  label: string;
  onUpload: (file: File) => Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await onUpload(file);
          if (ref.current) ref.current.value = '';
        }}
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
        <Upload className="h-3 w-3" />
        {label}
      </Button>
    </>
  );
}

export function FilialesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Filiales</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
      </div>

      {creating && (
        <FilialeForm onSave={create} onCancel={() => setCreating(false)} />
      )}

      {loadError && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-center" role="alert">
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchFiliales}>
            Réessayer
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-20 rounded border" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : filiales.map((f) => (
          <Card key={f.id}>
            <CardContent className="p-4">
              {editingId === f.id ? (
                <FilialeForm
                  filiale={f}
                  onSave={(data) => update(f.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {f.logoPath ? (
                      <img
                        src={`/api/filiales/file/${f.logoPath.replace('uploads/', '')}`}
                        alt={f.displayName}
                        className="h-10 w-20 object-contain rounded border"
                      />
                    ) : (
                      <div className="h-10 w-20 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground/70">
                        Pas de logo
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-foreground">{f.displayName}</p>
                      <p className="text-xs text-muted-foreground">AD: {f.name}</p>
                      {f.address && <p className="text-xs text-muted-foreground">{f.address}</p>}
                      {f.siret && <p className="text-xs text-muted-foreground">SIRET: {f.siret}</p>}
                    </div>
                    <Badge variant={f.active ? 'success' : 'outline'}>
                      {f.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileUploadButton
                      label="Logo"
                      onUpload={(file) => uploadFile(f.id, 'logo', file)}
                    />
                    <FileUploadButton
                      label="Cachet IT"
                      onUpload={(file) => uploadFile(f.id, 'stamp', file)}
                    />
                    <Button variant="outline" size="sm" onClick={() => setEditingId(f.id)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(f)}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!loading && !loadError && filiales.length === 0 && !creating && (
          <div className="text-center py-10 text-sm text-muted-foreground/70">
            Aucune filiale configuree
          </div>
        )}
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette filiale</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment supprimer la filiale &laquo;&nbsp;{deleteTarget?.displayName}&nbsp;&raquo; ?
              Cette action est irreversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={remove}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
