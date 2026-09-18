import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus } from 'lucide-react';
import type { CatalogItem } from './types';
import { clampQuantity, MIN_CATALOG_QUANTITY, MAX_CATALOG_QUANTITY } from './lib/equipmentLines';

const LISTBOX_ID = 'catalog-search-listbox';

// ── Ajout d'équipement depuis le catalogue ────────────────────
// Navigation clavier (flèches, Entrée, Échap) calquée sur le même pattern que
// GlobalSearch (components/layout/header/GlobalSearch.tsx), avec en plus les
// rôles ARIA combobox/listbox/option pour un lecteur d'écran.
export function CatalogSearch({
  allItems,
  onAdd,
}: {
  allItems: CatalogItem[];
  /** Appelé une fois par unité à ajouter — la quantité choisie ici se
   *  traduit par autant d'appels, pour rester compatible avec un ajout
   *  d'article « une ligne à la fois » côté appelant. */
  onAdd: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState('');
  // Chaîne brute (pas un nombre) : sinon un champ contrôlé revalidé à chaque
  // frappe empêche de le vider pour saisir une nouvelle valeur (il "rebondit"
  // aussitôt sur la borne basse). Le clampage n'intervient qu'à l'ajout/blur.
  const [quantityInput, setQuantityInput] = useState(String(MIN_CATALOG_QUANTITY));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
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

  // La liste filtrée change à chaque frappe : l'index actif doit rester dans
  // les bornes (sinon une touche flèche pourrait pointer un résultat disparu).
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(results.length - 1, 0)));
  }, [results.length]);

  const add = (item: CatalogItem) => {
    const count = clampQuantity(Number(quantityInput));
    for (let i = 0; i < count; i++) onAdd(item);
    setQuery('');
    setQuantityInput(String(MIN_CATALOG_QUANTITY));
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        add(results[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const activeItem = open ? results[active] : undefined;

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <input
          className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/70"
          placeholder="Ajouter depuis le catalogue..."
          aria-label="Rechercher dans le catalogue"
          role="combobox"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeItem ? `catalog-option-${activeItem.id}` : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setQuery(''); }}
            aria-label="Effacer la recherche catalogue"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        )}
        <label className="flex shrink-0 items-center gap-1 border-l border-border pl-2">
          <span className="text-xs text-muted-foreground/70">Qté</span>
          <input
            type="number"
            min={MIN_CATALOG_QUANTITY}
            max={MAX_CATALOG_QUANTITY}
            value={quantityInput}
            aria-label="Quantité à ajouter"
            className="w-10 bg-transparent text-center text-sm text-foreground outline-none"
            onChange={(e) => setQuantityInput(e.target.value)}
            onBlur={() => setQuantityInput(String(clampQuantity(Number(quantityInput))))}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
      </div>
      {open && (query.length > 0 || results.length > 0) && (
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Résultats du catalogue"
          className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg max-h-48 overflow-auto"
        >
          {results.length > 0 ? results.map((r, i) => (
            <button
              key={r.id}
              type="button"
              id={`catalog-option-${r.id}`}
              role="option"
              aria-selected={i === active}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm ${i === active ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => { e.preventDefault(); add(r); }}
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
