import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useApiResource } from '@/hooks/use-api-resource';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminStatus } from '@/pages/admin/configuration/ScheduledJobsCard';

/**
 * Alerte discrète (lot E3) : signale depuis le tableau de bord qu'une tâche
 * planifiée (@Cron) est en erreur ou en retard, avec un lien direct vers
 * Admin → Configuration → Monitoring. Invisible dès que tout va bien.
 *
 * Réservée aux administrateurs — la route `GET /admin/status` l'est déjà
 * côté backend. On ne l'appelle même pas pour un autre rôle (jamais de 403 à
 * essuyer), et toute erreur de chargement reste silencieuse : cette alerte
 * est un bonus, pas une information critique dont l'absence doit se voir.
 */
export function ScheduledJobsAlert() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data, error } = useApiResource<AdminStatus>(
    isAdmin ? '/admin/status' : null,
    'Statut des tâches planifiées indisponible',
  );

  if (!isAdmin || error || !data) return null;

  const errorJobs = data.jobs.filter((j) => j.lastStatus === 'error');
  const lateJobs = data.jobs.filter((j) => j.lastStatus !== 'error' && j.late);
  const problemCount = errorJobs.length + lateJobs.length;
  if (problemCount === 0) return null;

  const hasError = errorJobs.length > 0;
  const message = errorJobs.length > 0 && lateJobs.length > 0
    ? `${errorJobs.length} tâche(s) planifiée(s) en erreur, ${lateJobs.length} en retard`
    : errorJobs.length > 0
      ? `${errorJobs.length} tâche(s) planifiée(s) en erreur`
      : `${lateJobs.length} tâche(s) planifiée(s) en retard`;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-3 ${
        hasError ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/10'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle
          className={`h-4 w-4 shrink-0 ${hasError ? 'text-destructive' : 'text-warning'}`}
          aria-hidden="true"
        />
        <p className={`text-sm font-medium ${hasError ? 'text-destructive' : 'text-warning'}`}>{message}</p>
      </div>
      <Link to="/admin/configuration/monitoring" className="text-xs font-medium text-primary hover:underline">
        Voir le monitoring
      </Link>
    </div>
  );
}
