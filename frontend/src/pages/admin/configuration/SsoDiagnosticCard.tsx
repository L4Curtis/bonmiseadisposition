import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

interface SsoDiagnosticEntry {
  at: string;
  user: string;
  state: 'presente' | 'depassement' | 'absente' | string;
  groupsCount: number;
  resolvedRole: string | null;
  message: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  technician: 'Technicien',
  direction: 'Direction',
  collaborator: 'Collaborateur',
};

function formatDateHeure(valeur: string): string {
  return new Date(valeur).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Dernières connexions SSO et rôle attribué. Répond à la question « la personne
 * est dans le groupe Entra, pourquoi n'a-t-elle pas le rôle ? » : sans la
 * revendication de groupes sur l'inscription d'application, le jeton n'en
 * contient aucun et le rôle en base est conservé tel quel.
 */
export function SsoDiagnosticCard() {
  const [entries, setEntries] = useState<SsoDiagnosticEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const charger = () => {
    setLoading(true);
    setError(null);
    api
      .get<SsoDiagnosticEntry[]>('/admin/sso/diagnostic')
      .then(setEntries)
      .catch((e: unknown) => setError(errorMessage(e, 'Impossible de charger le diagnostic SSO')))
      .finally(() => setLoading(false));
  };

  useEffect(charger, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5 card-elevated">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Dernières connexions SSO</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rôle attribué à chaque connexion, et raison quand il ne l&apos;est pas.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={charger} disabled={loading} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualiser
        </Button>
      </div>

      <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground/80">
        <p className="font-medium">Prérequis côté Entra ID</p>
        <p className="mt-1">
          Inscriptions d&apos;application → votre application → Configuration du jeton → Ajouter une revendication de
          groupes → Groupes de sécurité, avec l&apos;identifiant de groupe dans le jeton d&apos;identité. Sans cette
          revendication, aucun rôle n&apos;est attribué et le rôle enregistré est conservé.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune connexion SSO enregistrée depuis la mise en service de ce diagnostic.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e, i) => {
            const ok = e.state === 'presente' && !!e.resolvedRole;
            return (
              <li key={`${e.at}-${i}`} className="flex items-start gap-3 py-2.5">
                {ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    {e.user}
                    {e.resolvedRole && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        → {ROLE_LABELS[e.resolvedRole] ?? e.resolvedRole}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateHeure(e.at)} · {e.groupsCount} groupe(s) reçu(s)
                  </p>
                  {e.message && <p className="mt-1 text-xs text-foreground/70">{e.message}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
