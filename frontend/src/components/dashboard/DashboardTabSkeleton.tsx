import { StatCardSkeleton } from '@/components/dashboard/StatCard';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Squelette générique affiché par `<Suspense>` pendant le téléchargement du
 * code d'un onglet du tableau de bord (Parc, Délais, Incidents — chargés
 * paresseusement car ils embarquent Recharts). Composé des mêmes squelettes
 * que ceux déjà utilisés par les onglets pour leur propre chargement de
 * données (StatCardSkeleton, Skeleton), pour qu'il n'y ait pas de saut visuel
 * entre le temps de chargement du chunk et celui, juste après, des données.
 */
export function DashboardTabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}
