import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useUiView, UI_VIEW_LABELS, UI_VIEW_ICON_MAP, type UiView } from '@/contexts/UiViewContext';
import { LogOut, KeyRound, Sun, Moon } from 'lucide-react';
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
    if (form.next.length < 8) {
      setError('Minimum 8 caractères');
      return;
    }
    if (!/[A-Z]/.test(form.next) || !/[0-9]/.test(form.next)) {
      setError('Le mot de passe doit contenir au moins une majuscule et un chiffre');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeView, setActiveView, availableViews } = useUiView();
  const [showChangePwd, setShowChangePwd] = useState(false);
  const isLocal = (user as any)?.isLocalAccount;

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-border bg-background px-6">
        <div />
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
                <span className="hidden sm:inline rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                  {UI_VIEW_LABELS[activeView]}
                </span>
              )}
              {isLocal && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">local</span>
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
