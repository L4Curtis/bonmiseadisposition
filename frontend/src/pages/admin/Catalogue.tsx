import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Package, ChevronDown, ChevronRight, X, Search } from 'lucide-react';

const CATEGORIES: Record<string, string> = {
  pc_portable: 'PC Portable',
  pc_fixe: 'PC Fixe',
  ecran: 'Écran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Téléphone',
  housse: 'Housse',
  dock: 'Dock',
  cable: 'Câble',
  autre: 'Autre',
};

interface CatalogItem {
  id: string;
  category: string;
  brand: string;
  model: string;
  description?: string;
  active: boolean;
}

interface Pack {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  items: { id: string; catalogItem: CatalogItem; quantity: number; order: number }[];
}

function CatalogItemForm({ item, onSave, onCancel }: {
  item?: CatalogItem;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    category: item?.category || 'pc_portable',
    brand: item?.brand || '',
    model: item?.model || '',
    description: item?.description || '',
  });

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Catégorie</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Marque</Label>
          <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} placeholder="Lenovo" />
        </div>
        <div className="space-y-1">
          <Label>Modèle</Label>
          <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="ThinkBook 16 G6" />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optionnel" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(form)}>Enregistrer</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

// ── Pack item search & add component ─────────────────────────
function PackItemAdder({ pack, allItems, onAdd }: {
  pack: Pack;
  allItems: CatalogItem[];
  onAdd: (item: CatalogItem, qty: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = allItems.filter((item) => {
    if (!item.active) return false;
    const q = query.toLowerCase();
    return (
      item.brand.toLowerCase().includes(q) ||
      item.model.toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      CATEGORIES[item.category].toLowerCase().includes(q)
    );
  }).slice(0, 15);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative mt-3">
      <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
          placeholder="Rechercher un équipement à ajouter..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button onClick={() => { setQuery(''); }}>
            <X className="h-3.5 w-3.5 text-slate-400" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg max-h-48 overflow-auto">
          {results.map((r) => {
            const alreadyIn = pack.items.some((i) => i.catalogItem.id === r.id);
            return (
              <button
                key={r.id}
                disabled={alreadyIn}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => { onAdd(r, 1); setQuery(''); setOpen(false); }}
              >
                <span>
                  <span className="font-medium">{r.brand} {r.model}</span>
                  <span className="ml-2 text-slate-400">{CATEGORIES[r.category]}</span>
                </span>
                {alreadyIn
                  ? <span className="text-xs text-slate-400">Déjà ajouté</span>
                  : <Plus className="h-3.5 w-3.5 text-slate-400" />}
              </button>
            );
          })}
        </div>
      )}
      {open && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg px-3 py-2 text-sm text-slate-400">
          Aucun équipement trouvé dans le catalogue
        </div>
      )}
    </div>
  );
}

export function CataloguePage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [tab, setTab] = useState<'catalogue' | 'packs'>('catalogue');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [newPackName, setNewPackName] = useState('');

  const fetchData = async () => {
    const [catalogData, packsData] = await Promise.all([
      api.get<CatalogItem[]>('/equipment/catalog'),
      api.get<Pack[]>('/equipment/packs'),
    ]);
    setItems(catalogData);
    setPacks(packsData);
  };

  useEffect(() => { fetchData(); }, []);

  const createItem = async (data: any) => {
    await api.post('/equipment/catalog', data);
    setCreating(false);
    fetchData();
  };

  const updateItem = async (id: string, data: any) => {
    await api.put(`/equipment/catalog/${id}`, data);
    setEditingId(null);
    fetchData();
  };

  const removeItem = async (id: string) => {
    if (!confirm('Désactiver cet équipement ?')) return;
    await api.delete(`/equipment/catalog/${id}`);
    fetchData();
  };

  const createPack = async () => {
    if (!newPackName.trim()) return;
    await api.post('/equipment/packs', { name: newPackName });
    setNewPackName('');
    fetchData();
  };

  const removePack = async (id: string) => {
    if (!confirm('Désactiver ce pack ?')) return;
    await api.delete(`/equipment/packs/${id}`);
    fetchData();
  };

  const addItemToPack = async (pack: Pack, catalogItem: CatalogItem, quantity: number) => {
    const newItems = [
      ...pack.items.map((i) => ({ catalogItemId: i.catalogItem.id, quantity: i.quantity, order: i.order })),
      { catalogItemId: catalogItem.id, quantity, order: pack.items.length },
    ];
    await api.put(`/equipment/packs/${pack.id}`, { items: newItems });
    fetchData();
  };

  const removeItemFromPack = async (pack: Pack, catalogItemId: string) => {
    const newItems = pack.items
      .filter((i) => i.catalogItem.id !== catalogItemId)
      .map((i, idx) => ({ catalogItemId: i.catalogItem.id, quantity: i.quantity, order: idx }));
    await api.put(`/equipment/packs/${pack.id}`, { items: newItems });
    fetchData();
  };

  const updateItemQty = async (pack: Pack, catalogItemId: string, quantity: number) => {
    const newItems = pack.items.map((i) => ({
      catalogItemId: i.catalogItem.id,
      quantity: i.catalogItem.id === catalogItemId ? quantity : i.quantity,
      order: i.order,
    }));
    await api.put(`/equipment/packs/${pack.id}`, { items: newItems });
    fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Catalogue & Packs</h1>
        <div className="flex gap-2">
          <Button
            variant={tab === 'catalogue' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('catalogue')}
          >Catalogue</Button>
          <Button
            variant={tab === 'packs' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('packs')}
          >Packs</Button>
        </div>
      </div>

      {tab === 'catalogue' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Ajouter un équipement
            </Button>
          </div>
          {creating && <CatalogItemForm onSave={createItem} onCancel={() => setCreating(false)} />}
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Catégorie</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Marque</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Modèle</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50">
                      {editingId === item.id ? (
                        <td colSpan={5} className="p-3">
                          <CatalogItemForm
                            item={item}
                            onSave={(data) => updateItem(item.id, data)}
                            onCancel={() => setEditingId(null)}
                          />
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2">{CATEGORIES[item.category]}</td>
                          <td className="px-4 py-2">{item.brand}</td>
                          <td className="px-4 py-2">{item.model}</td>
                          <td className="px-4 py-2">
                            <Badge variant={item.active ? 'success' : 'outline'}>
                              {item.active ? 'Actif' : 'Inactif'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => setEditingId(item.id)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'packs' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Nom du pack (ex: Pack nouveau collaborateur)"
              value={newPackName}
              onChange={(e) => setNewPackName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createPack()}
            />
            <Button size="sm" onClick={createPack}>
              <Plus className="h-4 w-4" /> Créer
            </Button>
          </div>
          <div className="space-y-2">
            {packs.map((pack) => (
              <Card key={pack.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      className="flex items-center gap-2 font-medium text-slate-900"
                      onClick={() => setExpandedPack(expandedPack === pack.id ? null : pack.id)}
                    >
                      {expandedPack === pack.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Package className="h-4 w-4 text-blue-500" />
                      {pack.name}
                      <Badge variant="outline">{pack.items.length} item(s)</Badge>
                    </button>
                    <Button variant="ghost" size="icon" onClick={() => removePack(pack.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                  {expandedPack === pack.id && (
                    <div className="mt-3 pl-4 space-y-1.5">
                      {pack.items.length === 0 && (
                        <p className="text-sm text-slate-400 pb-1">Aucun équipement — utilisez la recherche ci-dessous</p>
                      )}
                      {pack.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm">
                          <span className="flex-1 text-slate-700">
                            <span className="font-medium">{item.catalogItem.brand} {item.catalogItem.model}</span>
                            <span className="ml-2 text-slate-400">{CATEGORIES[item.catalogItem.category]}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              className="w-6 h-6 rounded border text-slate-500 hover:bg-white text-xs"
                              onClick={() => item.quantity > 1 && updateItemQty(pack, item.catalogItem.id, item.quantity - 1)}
                            >−</button>
                            <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                            <button
                              className="w-6 h-6 rounded border text-slate-500 hover:bg-white text-xs"
                              onClick={() => updateItemQty(pack, item.catalogItem.id, item.quantity + 1)}
                            >+</button>
                          </div>
                          <button
                            className="ml-1 text-slate-400 hover:text-red-500"
                            onClick={() => removeItemFromPack(pack, item.catalogItem.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <PackItemAdder pack={pack} allItems={items} onAdd={(item, qty) => addItemToPack(pack, item, qty)} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
