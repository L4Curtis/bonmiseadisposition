import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X, Plus } from 'lucide-react';
import { filterActiveCatalogItems } from './lib/search';
import { CATEGORIES } from './types';
import type { CatalogItem, Pack } from './types';

interface PackItemAdderProps {
  pack: Pack;
  allItems: CatalogItem[];
  onAdd: (item: CatalogItem, qty: number) => void;
}

// ── Pack item search & add component ─────────────────────────
export function PackItemAdder({ pack, allItems, onAdd }: PackItemAdderProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = filterActiveCatalogItems(allItems, query, CATEGORIES);

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
