import { useCallback, useRef, useState, type FormEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, Search } from 'lucide-react';
import { useCloseOnBack, usePanelNavigate } from '../use-close-on-back';
import { SearchResultsList } from './SearchResultsList';
import { MIN_QUERY_LENGTH, useBonSearch } from './use-bon-search';

/**
 * Recherche du téléphone : une loupe dans l'en-tête ouvre la recherche
 * globale en plein écran (même recherche que Ctrl+K sur ordinateur). Le
 * champ est en 16 px (pas de zoom automatique d'iOS) et le clavier affiche
 * « Rechercher ». Le geste retour, Échap et la flèche la ferment.
 */
export function MobileSearch() {
  const panelNavigate = usePanelNavigate();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useBonSearch(value);
  const query = value.trim();

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    // Refermée, la recherche repart d'un champ vide à la prochaine ouverture.
    if (!next) setValue('');
  }, []);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useCloseOnBack(open, close);

  // L'entrée d'historique de la recherche est remplacée par la page choisie.
  const go = (to: string) => {
    panelNavigate(to);
    onOpenChange(false);
  };
  const goToList = () => { if (query) go(`/bons?search=${encodeURIComponent(query)}`); };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    goToList();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger
        className="touch-target flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shell:hidden"
        aria-label="Rechercher"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Le champ reçoit le focus à l'ouverture : le clavier s'affiche aussitôt.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="mobile-fullscreen fixed inset-0 z-50 flex flex-col bg-card outline-none shell:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Recherche</DialogPrimitive.Title>
          <form role="search" onSubmit={onSubmit} className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
            <DialogPrimitive.Close
              className="touch-target flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fermer la recherche"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
            <input
              ref={inputRef}
              type="search"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Bon, collaborateur, n° de série…"
              aria-label="Recherche globale"
              className="h-11 min-w-0 flex-1 rounded-lg border border-border/70 bg-muted/40 px-3 text-base text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/50 focus:bg-card focus:ring-2 focus:ring-primary/15"
            />
          </form>
          <div className="flex-1 overflow-y-auto">
            {query.length < MIN_QUERY_LENGTH ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                Référence du bon, nom du collaborateur, n° de série ou d'inventaire.
              </p>
            ) : (
              <SearchResultsList
                query={query}
                search={search}
                active={-1}
                onSelect={(id) => go(`/bons/${id}`)}
                onSeeAll={goToList}
                touch
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
