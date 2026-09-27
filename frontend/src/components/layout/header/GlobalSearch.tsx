import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { SearchResultsList } from './SearchResultsList';
import { useBonSearch } from './use-bon-search';

/**
 * Recherche globale de l'ordinateur et de la tablette (Ctrl+K) : saut direct
 * à un bon, ou liste filtrée. Sur téléphone, c'est la loupe de l'en-tête qui
 * ouvre la même recherche en plein écran (`MobileSearch`).
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  // Panneau fermé à la main (Échap, clic à côté) : il se rouvre à la frappe suivante.
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const search = useBonSearch(value);
  const query = value.trim();
  // Le panneau s'ouvre dès qu'une recherche aboutit, et reste ouvert (résultats
  // précédents) pendant la recherche suivante.
  const open = !dismissed && (search.settled || search.results.length > 0);

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

  // Fermeture au clic extérieur
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setDismissed(true);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const onChange = (next: string) => { setValue(next); setDismissed(false); setActive(0); };
  const reset = () => { setValue(''); inputRef.current?.blur(); };
  const goToList = () => { if (!query) return; reset(); navigate(`/bons?search=${encodeURIComponent(query)}`); };
  const goToBon = (id: string) => { reset(); navigate(`/bons/${id}`); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const { results } = search;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && results[active]) goToBon(results[active].id); else goToList(); }
    else if (e.key === 'Escape') { setDismissed(true); inputRef.current?.blur(); }
  };

  return (
    <div ref={boxRef} className="group relative hidden shell:flex items-center">
      <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setDismissed(false)}
        onKeyDown={onKeyDown}
        placeholder="Rechercher un bon, un collaborateur, un n° de série ou d'inventaire…"
        aria-label="Recherche globale"
        className="h-8 w-72 lg:w-96 rounded-lg border border-border/70 bg-muted/40 pl-9 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-150 focus:w-[28rem] focus:bg-card focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
      />
      <kbd className="pointer-events-none absolute right-2.5 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-border/70 bg-card px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70">
        Ctrl K
      </kbd>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-[28rem] max-w-[90vw] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <SearchResultsList
            query={query}
            search={search}
            active={active}
            onHover={setActive}
            onSelect={goToBon}
            onSeeAll={goToList}
          />
        </div>
      )}
    </div>
  );
}
