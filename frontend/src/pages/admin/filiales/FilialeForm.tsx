import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X } from 'lucide-react';
import type { Filiale } from '@/types';
import { Toggle } from './Toggle';

export function FilialeForm({
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
          className={saved ? 'bg-success hover:bg-success text-success-foreground' : ''}
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
