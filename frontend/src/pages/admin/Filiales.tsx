import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  return (
    <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
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
        <Button size="sm" onClick={() => onSave(form)}>
          <Check className="h-3 w-3" /> Enregistrer
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
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchFiliales = async () => {
    const data = await api.get<Filiale[]>('/filiales');
    setFiliales(data);
  };

  useEffect(() => { fetchFiliales(); }, []);

  const create = async (data: Partial<Filiale>) => {
    await api.post('/filiales', data);
    setCreating(false);
    fetchFiliales();
  };

  const update = async (id: string, data: Partial<Filiale>) => {
    await api.put(`/filiales/${id}`, data);
    setEditingId(null);
    fetchFiliales();
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette filiale ?')) return;
    await api.delete(`/filiales/${id}`);
    fetchFiliales();
  };

  const uploadFile = async (id: string, type: 'logo' | 'stamp', file: File) => {
    const form = new FormData();
    form.append('file', file);
    await fetch(`/api/filiales/${id}/${type}`, {
      method: 'PATCH',
      body: form,
      credentials: 'include',
    });
    fetchFiliales();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Filiales</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
      </div>

      {creating && (
        <FilialeForm onSave={create} onCancel={() => setCreating(false)} />
      )}

      <div className="space-y-3">
        {filiales.map((f) => (
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
                      <div className="h-10 w-20 rounded border bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                        Pas de logo
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-slate-900">{f.displayName}</p>
                      <p className="text-xs text-slate-500">AD: {f.name}</p>
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
                    <Button variant="outline" size="sm" onClick={() => remove(f.id)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {filiales.length === 0 && !creating && (
          <div className="text-center py-10 text-sm text-slate-400">
            Aucune filiale configurée
          </div>
        )}
      </div>
    </div>
  );
}
