import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, ChevronRight } from 'lucide-react';
import { useConfigHealth, type ConfigHealthState, type ConfigHealthSection } from '@/hooks/use-config-health';

export type { ConfigHealthState, ConfigHealthSection };

/** Libellés d'état partagés avec les pastilles du menu latéral (AdminSubNav)
 *  — une seule source de vérité pour le texte associé à chaque état. */
export const CONFIG_HEALTH_STATE_LABELS: Record<ConfigHealthState, string> = {
  configure: 'Configuré',
  incomplet: 'Incomplet',
  desactive: 'Désactivé',
  non_configure: 'Non configuré',
};

const STATE_META: Record<ConfigHealthState, { icon: typeof CheckCircle2; className: string }> = {
  configure: { icon: CheckCircle2, className: 'text-success' },
  incomplet: { icon: AlertTriangle, className: 'text-warning' },
  desactive: { icon: MinusCircle, className: 'text-muted-foreground' },
  non_configure: { icon: XCircle, className: 'text-destructive' },
};

function formatUpdatedAt(value: string | null): string {
  if (!value) return 'Jamais modifié';
  return `Modifié le ${new Date(value).toLocaleDateString('fr-FR')}`;
}

/**
 * Vue d'ensemble de l'état de la configuration — affichée en haut de la page
 * « Général » (qui, seule, ne contenait que deux champs et paraissait vide).
 * Chaque ligne mène à la rubrique concernée : l'administrateur voit d'un
 * coup d'œil ce qui reste à faire sans ouvrir chaque rubrique une à une.
 */
export function ConfigHealthCard() {
  const { sections, loading, error: loadError, reload: load } = useConfigHealth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>État de la configuration</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>
              Réessayer
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(sections ?? []).map((section) => {
              const meta = STATE_META[section.state];
              const Icon = meta.icon;
              return (
                <li key={section.key}>
                  <Link
                    to={`/admin/configuration/${section.key}`}
                    className="flex items-center gap-3 py-2.5 rounded-md px-1.5 -mx-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${meta.className}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{section.label}</span>
                        <span className={`text-xs font-medium ${meta.className}`}>{CONFIG_HEALTH_STATE_LABELS[section.state]}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{section.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                      {formatUpdatedAt(section.updatedAt)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
