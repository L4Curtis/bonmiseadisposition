import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyMessage?: string;
  className?: string;
  children?: ReactNode;
}

/** Cadre commun pour tous les graphiques du tableau de bord : titre, sous-titre
 *  optionnel, et gestion uniforme des trois états chargement / vide / erreur. */
export function ChartCard({
  title,
  subtitle,
  loading,
  error,
  onRetry,
  empty,
  emptyMessage = 'Aucune donnée disponible',
  className,
  children,
}: ChartCardProps) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card card-elevated', className)}>
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground/70">{subtitle}</p>}
      </div>
      <div className="p-5">
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </div>
            <p className="mb-1 text-sm font-medium text-foreground/80">Erreur de chargement</p>
            <p className="max-w-xs text-xs text-muted-foreground/70">{error}</p>
            {onRetry && (
              <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-4">
                Réessayer
              </Button>
            )}
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-xs text-muted-foreground/70">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
