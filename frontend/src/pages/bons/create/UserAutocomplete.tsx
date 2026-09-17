import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Search, X } from 'lucide-react';
import type { UserResult } from './types';

// ── Autocomplete utilisateur ──────────────────────────────────
// Exporté (avec CatalogSearch) uniquement pour permettre leur test unitaire
// isolé — la page reste par ailleurs le seul export utilisé par le routeur.
export function UserAutocomplete({
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
    let ignore = false;
    const t = setTimeout(() => {
      api.get<UserResult[]>(`/users/search?q=${encodeURIComponent(query)}`)
        .then((res) => { if (!ignore) setResults(res); })
        .catch(() => { if (!ignore) setResults([]); });
    }, 250);
    return () => { ignore = true; clearTimeout(t); };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-blue-100 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
        <div>
          <p className="text-sm font-medium">{value.displayName}</p>
          <p className="text-xs text-muted-foreground">{value.email}{value.department ? ` — ${value.department}` : ''}</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onChange(null); }}
          className="text-muted-foreground/70 hover:text-muted-foreground"
          aria-label="Retirer le collaborateur sélectionné"
        >
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
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted/40"
              onClick={(e) => { e.preventDefault(); onChange(u); setQuery(''); setOpen(false); }}
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
