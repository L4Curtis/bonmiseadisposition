import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X, Plus } from 'lucide-react';
import { countActiveCatalogMatches, filterActiveCatalogItems, MAX_RESULTS } from './lib/search';
import { CATEGORIES } from './types';
import type { CatalogItem, Pack } from './types';

interface PackItemAdderProps {
  pack: Pack;
  allItems: CatalogItem[];
  onAdd: (item: CatalogItem, qty: number) => void;
}

const LISTBOX_ID = 'pack-item-adder-listbox';

/** Recherche et ajout d'un équipement à un pack : navigation clavier et rôles
 *  ARIA calqués sur `GlobalSearch` (flèches, Entrée, Échap,
 *  role="listbox"/"option", aria-expanded). */
export function PackItemAdder({ pack, allItems, onAdd }: PackItemAdderProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = filterActiveCatalogItems(allItems, query, CATEGORIES);
  const totalMatches = countActiveCatalogMatches(allItems, query, CATEGORIES);
  const truncated = totalMatches > results.length;

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectResult = (item: CatalogItem): void => {
    onAdd(item, 1);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[active];
      const alreadyIn = item && pack.items.some((i) => i.catalogItem.id === item.id);
      if (item && !alreadyIn) selectResult(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative mt-3">
      <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/60">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
        <Input
          ref={inputRef}
          className="flex-1 h-auto border-0 shadow-none p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/70"
          placeholder="Rechercher un équipement à ajouter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${LISTBOX_ID}-${results[active].id}` : undefined}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            aria-label="Effacer la recherche"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground/70" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Résultats de la recherche d'équipement"
          className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg max-h-48 overflow-auto"
        >
          {results.map((r, index) => {
            const alreadyIn = pack.items.some((i) => i.catalogItem.id === r.id);
            return (
              <button
                key={r.id}
                id={`${LISTBOX_ID}-${r.id}`}
                role="option"
                aria-selected={index === active}
                disabled={alreadyIn}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed ${index === active ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
                onClick={() => { if (!alreadyIn) selectResult(r); }}
              >
                <span>
                  <span className="font-medium">{r.brand} {r.model}</span>
                  <span className="ml-2 text-muted-foreground/70">{CATEGORIES[r.category]}</span>
                </span>
                {alreadyIn
                  ? <span className="text-xs text-muted-foreground/70">Déjà ajouté</span>
                  : <Plus className="h-3.5 w-3.5 text-muted-foreground/70" />}
              </button>
            );
          })}
          {truncated && (
            <p className="px-3 py-1.5 text-xs text-muted-foreground/70 border-t border-border">
              Résultats limités à {MAX_RESULTS} — affinez la recherche pour voir plus d'équipements.
            </p>
          )}
        </div>
      )}
      {open && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-lg px-3 py-2 text-sm text-muted-foreground/70">
          Aucun équipement trouvé dans le catalogue
        </div>
      )}
    </div>
  );
}
