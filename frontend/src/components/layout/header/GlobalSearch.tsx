import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { BON_STATUS_LABELS, type BonStatus } from '@/types';

interface SearchHit {
  id: string;
  reference: string;
  status: BonStatus;
  collaborateur: { displayName: string; email: string };
}

/** Recherche globale Ctrl+K : typeahead → saut direct à un bon, ou liste filtrée. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Raccourci ⌘K / Ctrl+K — standard des SaaS modernes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Recherche typeahead débattue (250 ms), à partir de 2 caractères
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    // Ignore une réponse arrivée après que la saisie ait changé entre-temps
    // (la requête réseau, une fois lancée, ne peut pas être annulée par clearTimeout).
    let ignore = false;
    const t = setTimeout(() => {
      api
        .get<{ bons: SearchHit[] }>(`/bons?search=${encodeURIComponent(q)}&limit=6`)
        .then((d) => {
          if (ignore) return;
          setResults(d.bons ?? []);
          setActive(0);
          setOpen(true);
        })
        .catch(() => { if (!ignore) setResults([]); })
        .finally(() => { if (!ignore) setLoading(false); });
    }, 250);
    return () => { ignore = true; clearTimeout(t); };
  }, [value]);

  // Fermeture au clic extérieur
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const reset = () => { setValue(''); setResults([]); setOpen(false); inputRef.current?.blur(); };
  const goToList = () => { const q = value.trim(); if (!q) return; reset(); navigate(`/bons?search=${encodeURIComponent(q)}`); };
  const goToBon = (id: string) => { reset(); navigate(`/bons/${id}`); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && results[active]) goToBon(results[active].id); else goToList(); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div ref={boxRef} className="group relative hidden md:flex items-center">
      <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder="Rechercher un bon, un collaborateur, un n° de série…"
        aria-label="Recherche globale"
        className="h-8 w-72 lg:w-96 rounded-lg border border-border/70 bg-muted/40 pl-9 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-150 focus:w-[28rem] focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
      />
      <kbd className="pointer-events-none absolute right-2.5 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-border/70 bg-card px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70">
        Ctrl K
      </kbd>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-[28rem] max-w-[90vw] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {loading && results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Recherche…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Aucun bon. Entrée pour la recherche complète.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((b, i) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => goToBon(b.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? 'bg-primary/10' : 'hover:bg-muted/60'}`}
                  >
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">{b.reference}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{b.collaborateur.displayName}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{BON_STATUS_LABELS[b.status]}</span>
                  </button>
                </li>
              ))}
              <li className="border-t border-border">
                <button type="button" onClick={goToList} className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-muted/60">
                  Voir tous les résultats pour « {value.trim()} »
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
