import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Check } from 'lucide-react';
import { validateCatalogItemForm } from './lib/validation';
import { CATEGORIES } from './types';
import type { CatalogItem, CatalogItemFormValues } from './types';

interface CatalogueItemFormProps {
  item?: CatalogItem;
  onSave: (data: CatalogItemFormValues) => Promise<boolean>;
  onCancel: () => void;
}

export function CatalogueItemForm({ item, onSave, onCancel }: CatalogueItemFormProps) {
  const [form, setForm] = useState({
    category: item?.category || 'pc_portable',
    brand: item?.brand || '',
    model: item?.model || '',
    description: item?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // Suffixe d'id stable par instance : la création et l'édition inline
  // peuvent en théorie s'afficher en même temps (formulaires indépendants),
  // il faut donc éviter des id en double dans le DOM.
  const idSuffix = item?.id ?? 'new';

  const handleSave = async () => {
    const validationError = validateCatalogItemForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSaving(true);
    const ok = await onSave({ ...form, brand: form.brand.trim(), model: form.model.trim() });
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`catalogue-item-category-${idSuffix}`}>Catégorie</Label>
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
            <SelectTrigger id={`catalogue-item-category-${idSuffix}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`catalogue-item-brand-${idSuffix}`}>Marque</Label>
          <Input
            id={`catalogue-item-brand-${idSuffix}`}
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            placeholder="Lenovo"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`catalogue-item-model-${idSuffix}`}>Modèle</Label>
          <Input
            id={`catalogue-item-model-${idSuffix}`}
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="ThinkBook 16 G6"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`catalogue-item-description-${idSuffix}`}>Description</Label>
          <Input
            id={`catalogue-item-description-${idSuffix}`}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optionnel"
          />
        </div>
      </div>
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
        <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}
