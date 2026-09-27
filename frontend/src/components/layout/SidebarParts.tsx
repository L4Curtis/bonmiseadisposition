import { useAuth } from '@/contexts/AuthContext';
import { useUiView, UI_VIEW_LABELS } from '@/contexts/UiViewContext';
import { cn } from '@/lib/utils';

/** Logo et nom de l'application, en tête du menu latéral et du tiroir. */
export function BrandMark({ collapsed = false }: { readonly collapsed?: boolean }) {
  return (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl btn-gradient text-xs font-bold tracking-tight text-white ring-1 ring-white/20">
        GL
      </div>
      <div className={cn('min-w-0 flex-1 transition-opacity duration-200', collapsed ? 'opacity-0' : 'opacity-100')}>
        <p className="text-sm font-semibold leading-none tracking-tight text-foreground">Bons IT</p>
        <p className="mt-1 text-[10px] leading-none text-muted-foreground">Groupe Livio</p>
      </div>
    </>
  );
}

/** Personne connectée et vue active, au pied du menu latéral et du tiroir. */
export function UserBadge({ collapsed }: { readonly collapsed: boolean }) {
  const { user } = useAuth();
  const { activeView } = useUiView();

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full btn-gradient text-[10px] font-bold text-white ring-1 ring-white/20">
        {user?.displayName?.slice(0, 2).toUpperCase() || '??'}
      </div>
      <div className={cn('min-w-0 whitespace-nowrap transition-opacity duration-200', collapsed ? 'opacity-0' : 'opacity-100')}>
        <p className="truncate text-xs font-medium leading-none text-foreground">{user?.displayName}</p>
        <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">{UI_VIEW_LABELS[activeView]}</p>
      </div>
    </div>
  );
}

/** Libellé complet de la personne connectée (infobulle du menu replié). */
export function useUserSummary(): string {
  const { user } = useAuth();
  const { activeView } = useUiView();
  return `${user?.displayName ?? ''} — ${UI_VIEW_LABELS[activeView]}`;
}
