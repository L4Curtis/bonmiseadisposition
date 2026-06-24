import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useUiView, UI_VIEW_LABELS, UI_VIEW_ICON_MAP, type UiView } from '@/contexts/UiViewContext';
import type { User } from '@/types';
import { LogOut, KeyRound, Sun, Moon, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { BON_STATUS_LABELS, type BonStatus } from '@/types';

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClose = (v: boolean) => {
    if (!v) {
      setForm({ current: '', next: '', confirm: '' });
      setError('');
      setSuccess(false);
    }
    onOpenChange(v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (form.next.length < 12) {
      setError('Minimum 12 caractères');
      return;
    }
    if (!/[A-Z]/.test(form.next) || !/[a-z]/.test(form.next) || !/[0-9]/.test(form.next) || !/[@$!%*?&_#^+=\-.]/.test(form.next)) {
      setError('Le mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
        credentials: 'include',
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const d = await res.json();
        setError(d.message || 'Erreur');
      }
    } catch {
      setError('Erreur serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Changer le mot de passe</DialogTitle>
        </DialogHeader>
        {success ? (
          <div className="text-center py-4" aria-live="polite">
            <p className="text-green-600 font-medium">Mot de passe modifié avec succès</p>
            <Button variant="ghost" size="sm" onClick={() => handleClose(false)} className="mt-3">
              Fermer
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="current-pwd">Mot de passe actuel</Label>
              <Input
                id="current-pwd"
                type="password"
                value={form.current}
                onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
              <Input
                id="new-pwd"
                type="password"
                value={form.next}
                onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pwd">Confirmer</Label>
              <Input
                id="confirm-pwd"
                type="password"
                value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SearchHit {
  id: string;
  reference: string;
  status: BonStatus;
  collaborateur: { displayName: string; email: string };
}

/** Recherche globale Ctrl+K : typeahead → saut direct à un bon, ou liste filtrée. */
function GlobalSearch() {
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
    const t = setTimeout(() => {
      api
        .get<{ bons: SearchHit[] }>(`/bons?search=${encodeURIComponent(q)}&limit=6`)
        .then((d) => { setResults(d.bons ?? []); setActive(0); setOpen(true); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
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

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeView, setActiveView, availableViews } = useUiView();
  const [showChangePwd, setShowChangePwd] = useState(false);
  const isLocal = !!(user as User & { isLocalAccount?: boolean })?.isLocalAccount;
  const isItView = activeView !== 'collaborateur';

  return (
    <>
      <header className="glass-header sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between px-6">
        <div className="flex items-center">
          {isItView && <GlobalSearch />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Menu utilisateur"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                  {getInitials(user?.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline font-medium text-xs">{user?.displayName}</span>
              {availableViews.length > 1 && (
                <span className="hidden sm:inline rounded-full bg-[hsl(var(--primary)/0.10)] dark:bg-[hsl(var(--primary)/0.15)] px-1.5 py-0.5 text-[10px] text-[hsl(var(--primary))] font-medium">
                  {UI_VIEW_LABELS[activeView]}
                </span>
              )}
              {isLocal && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">local</span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>

            {availableViews.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Vue active</p>
                <DropdownMenuRadioGroup
                  value={activeView}
                  onValueChange={(v) => setActiveView(v as UiView)}
                >
                  {availableViews.map((view) => {
                    const Icon = UI_VIEW_ICON_MAP[view];
                    return (
                      <DropdownMenuRadioItem key={view} value={view}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {UI_VIEW_LABELS[view]}
                        </span>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </>
            )}

            <DropdownMenuSeparator />
            {isLocal && (
              <DropdownMenuItem onClick={() => setShowChangePwd(true)}>
                <KeyRound className="mr-2 h-4 w-4" />
                Changer le mot de passe
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>
      <ChangePasswordDialog open={showChangePwd} onOpenChange={setShowChangePwd} />
    </>
  );
}
