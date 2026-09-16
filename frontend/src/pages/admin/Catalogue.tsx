import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Package, ChevronDown, ChevronRight, X, Search, Check } from 'lucide-react';

const CATEGORIES: Record<string, string> = {
  pc_portable: 'PC Portable',
  pc_fixe: 'PC Fixe',
  ecran: 'Ecran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Telephone',
  housse: 'Housse',
  dock: 'Dock',
  cable: 'Cable',
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

type DeleteTarget =
  | { type: 'item'; id: string; label: string }
  | { type: 'pack'; id: string; label: string };

type RemovePackItemTarget = { pack: Pack; catalogItemId: string; label: string };

function CatalogItemForm({ item, onSave, onCancel }: {
  item?: CatalogItem;
  onSave: (data: { category: string; brand: string; model: string; description: string }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    category: item?.category || 'pc_portable',
    brand: item?.brand || '',
    model: item?.model || '',
    description: item?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.brand.trim() || !form.model.trim()) {
      setError('La marque et le modèle sont obligatoires');
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
          <Label>Categorie</Label>
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
            <SelectTrigger>
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
          <Label>Marque</Label>
          <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} placeholder="Lenovo" />
        </div>
        <div className="space-y-1">
          <Label>Modele</Label>
          <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="ThinkBook 16 G6" />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optionnel" />
        </div>
      </div>
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
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <Input
          className="flex-1 h-auto border-0 shadow-none p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/70"
          placeholder="Rechercher un equipement a ajouter..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button onClick={() => { setQuery(''); }}>
            <X className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg max-h-48 overflow-auto">
          {results.map((r) => {
            const alreadyIn = pack.items.some((i) => i.catalogItem.id === r.id);
            return (
              <button
                key={r.id}
                disabled={alreadyIn}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => { onAdd(r, 1); setQuery(''); setOpen(false); }}
              >
                <span>
                  <span className="font-medium">{r.brand} {r.model}</span>
                  <span className="ml-2 text-muted-foreground/70">{CATEGORIES[r.category]}</span>
                </span>
                {alreadyIn
                  ? <span className="text-xs text-muted-foreground/70">Deja ajoute</span>
                  : <Plus className="h-3.5 w-3.5 text-muted-foreground/70" />}
              </button>
            );
          })}
        </div>
      )}
      {open && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg px-3 py-2 text-sm text-muted-foreground/70">
          Aucun equipement trouve dans le catalogue
        </div>
      )}
    </div>
  );
}

export function CataloguePage() {
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

  const createItem = async (data: { category: string; brand: string; model: string; description: string }): Promise<boolean> => {
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

  const updateItem = async (id: string, data: { category: string; brand: string; model: string; description: string }): Promise<boolean> => {
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
    const newItems = [
      ...current.items.map((i) => ({ catalogItemId: i.catalogItem.id, quantity: i.quantity, order: i.order })),
      { catalogItemId: catalogItem.id, quantity, order: current.items.length },
    ];
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
    const newItems = current.items
      .filter((i) => i.catalogItem.id !== catalogItemId)
      .map((i, idx) => ({ catalogItemId: i.catalogItem.id, quantity: i.quantity, order: idx }));
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
    const newItems = current.items.map((i) => ({
      catalogItemId: i.catalogItem.id,
      quantity: i.catalogItem.id === catalogItemId ? quantity : i.quantity,
      order: i.order,
    }));
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Catalogue & Packs</h1>
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

      {loadError && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-center" role="alert">
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            Réessayer
          </Button>
        </div>
      )}

      {tab === 'catalogue' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Ajouter un equipement
            </Button>
          </div>
          {creating && <CatalogItemForm onSave={createItem} onCancel={() => setCreating(false)} />}
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm" aria-label="Catalogue des équipements">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categorie</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Marque</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modele</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-4 py-2"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-4 py-2"><Skeleton className="h-4 w-16" /></td>
                        <td className="px-4 py-2"><Skeleton className="h-4 w-28" /></td>
                        <td className="px-4 py-2"><Skeleton className="h-5 w-12 rounded-full" /></td>
                        <td className="px-4 py-2"><Skeleton className="h-8 w-16" /></td>
                      </tr>
                    ))
                  ) : items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/40">
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
                              <Button variant="ghost" size="icon" onClick={() => setEditingId(item.id)} aria-label={`Modifier ${item.brand} ${item.model}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {item.active ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget({ type: 'item', id: item.id, label: `${item.brand} ${item.model}` })}
                                  aria-label={`Supprimer ${item.brand} ${item.model}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" onClick={() => reactivateItem(item)}>
                                  Réactiver
                                </Button>
                              )}
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
              <Plus className="h-4 w-4" /> Creer
            </Button>
          </div>
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : packs.map((pack) => {
              const packPending = pendingPackId === pack.id;
              return (
              <Card key={pack.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      className="flex items-center gap-2 font-medium text-foreground"
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
                      {!pack.active && (
                        <Badge variant="outline" className="border-red-300 text-red-600">Inactif</Badge>
                      )}
                    </button>
                    {pack.active ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget({ type: 'pack', id: pack.id, label: pack.name })}
                        aria-label={`Supprimer le pack ${pack.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => reactivatePack(pack)}>
                        Réactiver
                      </Button>
                    )}
                  </div>
                  {expandedPack === pack.id && (
                    <div className="mt-3 pl-4 space-y-1.5">
                      {pack.items.length === 0 && (
                        <p className="text-sm text-muted-foreground/70 pb-1">Aucun equipement -- utilisez la recherche ci-dessous</p>
                      )}
                      {pack.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-sm">
                          <span className="flex-1 text-foreground/80">
                            <span className="font-medium">{item.catalogItem.brand} {item.catalogItem.model}</span>
                            <span className="ml-2 text-muted-foreground/70">{CATEGORIES[item.catalogItem.category]}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-6 h-6 text-xs"
                              disabled={packPending || item.quantity <= 1}
                              onClick={() => updateItemQty(pack, item.catalogItem.id, item.quantity - 1)}
                              aria-label="Diminuer la quantité"
                            >-</Button>
                            <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-6 h-6 text-xs"
                              disabled={packPending}
                              onClick={() => updateItemQty(pack, item.catalogItem.id, item.quantity + 1)}
                              aria-label="Augmenter la quantité"
                            >+</Button>
                          </div>
                          <button
                            className="ml-1 text-muted-foreground/70 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={packPending}
                            onClick={() => setRemovePackItemTarget({
                              pack,
                              catalogItemId: item.catalogItem.id,
                              label: `${item.catalogItem.brand} ${item.catalogItem.model}`,
                            })}
                            aria-label={`Retirer ${item.catalogItem.brand} ${item.catalogItem.model} du pack`}
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
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Desactiver {deleteTarget?.type === 'pack' ? 'ce pack' : 'cet equipement'}
            </DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment desactiver &laquo;&nbsp;{deleteTarget?.label}&nbsp;&raquo; ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Desactiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removePackItemTarget !== null} onOpenChange={(open) => { if (!open) setRemovePackItemTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirer cet équipement du pack</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment retirer &laquo;&nbsp;{removePackItemTarget?.label}&nbsp;&raquo; du pack
              &laquo;&nbsp;{removePackItemTarget?.pack.name}&nbsp;&raquo; ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovePackItemTarget(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmRemovePackItem}>
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
