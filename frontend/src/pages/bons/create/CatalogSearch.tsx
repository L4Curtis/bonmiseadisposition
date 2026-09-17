import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus } from 'lucide-react';
import type { CatalogItem } from './types';

// ── Ajout d'équipement depuis le catalogue ────────────────────
export function CatalogSearch({
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
        {query && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setQuery(''); }}
            aria-label="Effacer la recherche catalogue"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        )}
      </div>
      {open && (query.length > 0 || results.length > 0) && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg max-h-48 overflow-auto">
          {results.length > 0 ? results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/40"
              onClick={(e) => { e.preventDefault(); onAdd(r); setQuery(''); setOpen(false); }}
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
