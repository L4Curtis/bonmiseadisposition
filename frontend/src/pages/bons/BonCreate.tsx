import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, Plus, Trash2, ChevronLeft, CalendarCheck } from 'lucide-react';
import { bonCreateSchema, validate } from '@/lib/validation';
import { todayLocalISO } from '@/lib/utils';
import type { Filiale } from '@/types';

interface UserResult {
  id: string;
  displayName: string;
  email: string;
  department?: string;
}

interface CatalogItem {
  id: string;
  brand: string;
  model: string;
  category: string;
  active: boolean;
}

interface Pack {
  id: string;
  name: string;
  items: { id: string; catalogItem: CatalogItem; quantity: number }[];
}

interface EquipmentLine {
  _id: string; // local key
  catalogItemId?: string;
  catalogItemLabel?: string;
  customLabel?: string;
  serialNumber?: string;
  inventoryNumber?: string;
  notes?: string;
}

let lineCounter = 0;
const newLine = (partial?: Partial<EquipmentLine>): EquipmentLine => ({
  _id: String(lineCounter++),
  ...partial,
});

// ── Autocomplete utilisateur ──────────────────────────────────
function UserAutocomplete({
  value,
  onChange,
}: {
  value: UserResult | null;
  onChange: (u: UserResult | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get<UserResult[]>(`/users/search?q=${encodeURIComponent(query)}`).then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-blue-100 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
        <div>
          <p className="text-sm font-medium">{value.displayName}</p>
          <p className="text-xs text-muted-foreground">{value.email}{value.department ? ` — ${value.department}` : ''}</p>
        </div>
        <button onClick={() => onChange(null)} className="text-muted-foreground/70 hover:text-muted-foreground" aria-label="Retirer le collaborateur sélectionné">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <input
          className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/70"
          placeholder="Rechercher un collaborateur..."
          aria-label="Rechercher un collaborateur"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg max-h-48 overflow-auto">
          {results.map((u) => (
            <button
              key={u.id}
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted/40"
              onClick={() => { onChange(u); setQuery(''); setOpen(false); }}
            >
              <span className="font-medium">{u.displayName}</span>
              <span className="text-xs text-muted-foreground/70">{u.email}{u.department ? ` — ${u.department}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg px-3 py-2 text-sm text-muted-foreground/70">
          Aucun collaborateur trouvé
        </div>
      )}
    </div>
  );
}

// ── Ajout d'équipement depuis le catalogue ────────────────────
function CatalogSearch({
  allItems,
  onAdd,
}: {
  allItems: CatalogItem[];
  onAdd: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = allItems
    .filter((item) => {
      if (!item.active) return false;
      const q = query.toLowerCase();
      return (
        item.brand.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q)
      );
    })
    .slice(0, 12);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <input
          className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/70"
          placeholder="Ajouter depuis le catalogue..."
          aria-label="Rechercher dans le catalogue"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {query && <button onClick={() => setQuery('')} aria-label="Effacer la recherche catalogue"><X className="h-3.5 w-3.5 text-muted-foreground/70" /></button>}
      </div>
      {open && (query.length > 0 || results.length > 0) && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg max-h-48 overflow-auto">
          {results.length > 0 ? results.map((r) => (
            <button
              key={r.id}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/40"
              onClick={() => { onAdd(r); setQuery(''); setOpen(false); }}
            >
              <span className="font-medium">{r.brand} {r.model}</span>
              <Plus className="h-3.5 w-3.5 text-muted-foreground/70" />
            </button>
          )) : (
            <div className="px-3 py-2 text-sm text-muted-foreground/70">Aucun résultat</div>
          )}
        </div>
      )}
    </div>
  );
}

export function BonCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [collaborateur, setCollaborateur] = useState<UserResult | null>(null);
  const [filialeId, setFilialeId] = useState('');
  const [civilite, setCivilite] = useState<'mme' | 'mr'>('mr');
  const [dateMiseDisposition, setDateMiseDisposition] = useState('');
  const [dateRestitution, setDateRestitution] = useState('');
  const [notes, setNotes] = useState('');
  const [equipments, setEquipments] = useState<EquipmentLine[]>([newLine()]);

  // Data
  const [filiales, setFiliales] = useState<Filiale[]>([]);
  const [allCatalogItems, setAllCatalogItems] = useState<CatalogItem[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [initError, setInitError] = useState(false);
  const [initReloadKey, setInitReloadKey] = useState(0);

  useEffect(() => {
    setInitError(false);
    Promise.all([
      api.get<Filiale[]>('/filiales/active'),
      api.get<CatalogItem[]>('/equipment/catalog').then((d) =>
        Array.isArray(d) ? d : []
      ),
      api.get<Pack[]>('/equipment/packs'),
    ]).then(([f, items, p]) => {
      setFiliales(f);
      setAllCatalogItems(Array.isArray(items) ? items : []);
      setPacks(Array.isArray(p) ? p : []);
    }).catch(() => {
      // Sans filiales/catalogue le formulaire est inutilisable : le signaler
      setInitError(true);
    });
  }, [initReloadKey]);

  const addFromCatalog = (item: CatalogItem) => {
    setEquipments((prev) => [
      ...prev,
      newLine({ catalogItemId: item.id, catalogItemLabel: `${item.brand} ${item.model}` }),
    ]);
  };

  const addFromPack = (pack: Pack) => {
    const lines = pack.items.flatMap((pi) =>
      Array.from({ length: pi.quantity }, () =>
        newLine({
          catalogItemId: pi.catalogItem.id,
          catalogItemLabel: `${pi.catalogItem.brand} ${pi.catalogItem.model}`,
        }),
      ),
    );
    setEquipments((prev) => {
      // Ne retirer que les lignes totalement vides : une ligne avec un numéro
      // de série ou des notes saisis ne doit pas être perdue par l'import
      const filtered = prev.filter(
        (e) => e.catalogItemId || e.customLabel?.trim() || e.serialNumber?.trim() || e.inventoryNumber?.trim() || e.notes?.trim(),
      );
      return [...filtered, ...lines];
    });
  };

  const removeEquipment = (id: string) => {
    setEquipments((prev) => prev.filter((e) => e._id !== id));
  };

  const updateEquipment = (id: string, field: keyof EquipmentLine, value: string) => {
    setEquipments((prev) => prev.map((e) => (e._id === id ? { ...e, [field]: value } : e)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validEquipments = equipments.filter((e) => e.catalogItemId || e.customLabel?.trim());
    const result = validate(bonCreateSchema, {
      collaborateurId: collaborateur?.id ?? '',
      filialeId,
      dateMiseDisposition,
      dateRestitution: dateRestitution || undefined,
      civilite,
      equipments: validEquipments.map((e) => ({
        catalogItemId: e.catalogItemId || undefined,
        customLabel: e.customLabel || undefined,
        serialNumber: e.serialNumber || undefined,
        inventoryNumber: e.inventoryNumber || undefined,
        notes: e.notes || undefined,
      })),
    });
    if (!result.success) {
      setError(Object.values(result.errors)[0]);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const bon = await api.post<{ id: string }>('/bons', {
        filialeId,
        collaborateurId: collaborateur!.id,
        civilite,
        dateMiseDisposition,
        dateRestitution: dateRestitution || undefined,
        notes: notes || undefined,
        equipments: validEquipments.map((e, idx) => ({
          catalogItemId: e.catalogItemId || undefined,
          customLabel: e.customLabel || undefined,
          serialNumber: e.serialNumber || undefined,
          inventoryNumber: e.inventoryNumber || undefined,
          notes: e.notes || undefined,
          order: idx,
        })),
      });
      navigate(`/bons/${bon.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/bons')} className="text-muted-foreground/70 hover:text-muted-foreground" aria-label="Retour à la liste des bons">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Nouveau bon de mise à disposition</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {initError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3" role="alert">
            <span>Impossible de charger les filiales et le catalogue — le formulaire est incomplet.</span>
            <button
              type="button"
              className="shrink-0 font-medium underline hover:no-underline"
              onClick={() => setInitReloadKey((k) => k + 1)}
            >
              Réessayer
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {/* Collaborateur & Filiale */}
        <Card>
          <CardHeader><CardTitle className="text-base">Collaborateur & Filiale</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Civilité</Label>
              <div className="flex gap-2">
                {(['mr', 'mme'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCivilite(c)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      civilite === c
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-card text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    {c === 'mr' ? 'M.' : 'Mme'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Filiale *</Label>
              <Select value={filialeId || undefined} onValueChange={setFilialeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une filiale..." />
                </SelectTrigger>
                <SelectContent>
                  {filiales.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Collaborateur *</Label>
              <UserAutocomplete value={collaborateur} onChange={setCollaborateur} />
            </div>
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dates</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Date de mise à disposition *</Label>
              <div className="flex gap-1.5">
                <Input
                  type="date"
                  value={dateMiseDisposition}
                  onChange={(e) => setDateMiseDisposition(e.target.value)}
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Aujourd'hui"
                  onClick={() => setDateMiseDisposition(todayLocalISO())}
                >
                  <CalendarCheck className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Date de restitution prévue <span className="text-muted-foreground/70 text-xs">(optionnel)</span></Label>
              <div className="flex gap-1.5">
                <Input
                  type="date"
                  value={dateRestitution}
                  onChange={(e) => setDateRestitution(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Aujourd'hui"
                  onClick={() => setDateRestitution(todayLocalISO())}
                >
                  <CalendarCheck className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Équipements */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Équipements</CardTitle>
              <div className="flex gap-2">
                {/* Import depuis pack */}
                {packs.filter((p) => (p as Pack & { active?: boolean }).active !== false).length > 0 && (
                  <select
                    className="rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground"
                    value=""
                    onChange={(e) => {
                      const pack = packs.find((p) => p.id === e.target.value);
                      if (pack) addFromPack(pack);
                    }}
                  >
                    <option value="">Importer un pack...</option>
                    {packs.filter((p) => (p as Pack & { active?: boolean }).active !== false).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEquipments((prev) => [...prev, newLine()])}
                >
                  <Plus className="h-3.5 w-3.5" /> Ligne vide
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <CatalogSearch allItems={allCatalogItems} onAdd={addFromCatalog} />

            {equipments.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground/70 py-4">Aucun équipement ajouté</p>
            ) : (
              <div className="mt-2 space-y-1">
                {/* Header */}
                <div className="grid grid-cols-[1fr_120px_120px_80px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span>Désignation</span>
                  <span>N° Série</span>
                  <span>N° Inventaire</span>
                  <span>Notes</span>
                  <span />
                </div>
                {equipments.map((eq) => (
                  <div key={eq._id} className="grid grid-cols-[1fr_120px_120px_80px_32px] gap-2 items-center">
                    <div>
                      {eq.catalogItemId ? (
                        <div className="flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-2 py-1.5 text-sm">
                          <span className="font-medium text-blue-800 dark:text-blue-200">{eq.catalogItemLabel}</span>
                          <button
                            type="button"
                            onClick={() => updateEquipment(eq._id, 'catalogItemId', '')}
                            className="ml-auto text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300"
                            aria-label="Retirer cet article du catalogue"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <Input
                          placeholder="Libellé personnalisé"
                          value={eq.customLabel || ''}
                          onChange={(e) => updateEquipment(eq._id, 'customLabel', e.target.value)}
                          className="h-8 text-sm"
                        />
                      )}
                    </div>
                    <Input
                      placeholder="SN-XXXXX"
                      value={eq.serialNumber || ''}
                      onChange={(e) => updateEquipment(eq._id, 'serialNumber', e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="INV-XXXXX"
                      value={eq.inventoryNumber || ''}
                      onChange={(e) => updateEquipment(eq._id, 'inventoryNumber', e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="..."
                      value={eq.notes || ''}
                      onChange={(e) => updateEquipment(eq._id, 'notes', e.target.value)}
                      className="h-8 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeEquipment(eq._id)}
                      className="text-muted-foreground/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      aria-label="Supprimer cet équipement"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">Remarques <span className="text-muted-foreground/70 text-xs font-normal">(optionnel)</span></CardTitle></CardHeader>
          <CardContent>
            <textarea
              className="w-full rounded-md border bg-transparent text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder="Informations complémentaires..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => navigate('/bons')}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Création...' : 'Créer le bon'}
          </Button>
        </div>
      </form>
    </div>
  );
}
