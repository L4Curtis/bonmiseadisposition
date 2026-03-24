import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
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

function FilialeForm({
  filiale,
  onSave,
  onCancel,
}: {
  filiale?: Filiale;
  onSave: (data: Partial<Filiale>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: filiale?.name || '',
    displayName: filiale?.displayName || '',
    address: '',
    siret: '',
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
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
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saved}
          className={saved ? 'bg-green-600 hover:bg-green-600 text-white' : ''}
          onClick={handleSave}
        >
          <Check className="h-3 w-3" />
          {saved ? 'Enregistré' : 'Enregistrer'}
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
  const [filiales, setFiliales] = useState<Filiale[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Filiale | null>(null);

  const fetchFiliales = async () => {
    const data = await api.get<Filiale[]>('/filiales');
    setFiliales(data);
    setLoading(false);
  };

  useEffect(() => { fetchFiliales(); }, []);

  const create = async (data: Partial<Filiale>) => {
    try {
      await api.post('/filiales', data);
      toast({ title: 'Filiale creee', variant: 'success' });
      setCreating(false);
      fetchFiliales();
    } catch {
      toast({ title: 'Erreur lors de la creation', variant: 'destructive' });
    }
  };

  const update = async (id: string, data: Partial<Filiale>) => {
    try {
      await api.put(`/filiales/${id}`, data);
      toast({ title: 'Filiale mise a jour', variant: 'success' });
      setEditingId(null);
      fetchFiliales();
    } catch {
      toast({ title: 'Erreur lors de la mise a jour', variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/filiales/${deleteTarget.id}`);
      toast({ title: 'Filiale supprimee', variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
      fetchFiliales();
    }
  };

  const uploadFile = async (id: string, type: 'logo' | 'stamp', file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`/api/filiales/${id}/${type}`, {
        method: 'PATCH',
        body: form,
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) throw new Error('Upload échoué');
      toast({ title: `${type === 'logo' ? 'Logo' : 'Cachet'} mis à jour`, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de l\'upload', variant: 'destructive' });
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(f)}
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!loading && filiales.length === 0 && !creating && (
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
