import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { showActionError } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, Eye, Loader2, ShieldX } from 'lucide-react';
import {
  isSimulationFresh,
  simulateRetention,
  type RetentionRunResult,
  type RetentionSimulation,
  type RetentionStats,
} from './retention-api';
import { RetentionSimulationSummary } from './RetentionSimulationSummary';

/**
 * Anonymisation lancée à la main. Le serveur exige une simulation (dry-run) de
 * moins de 24 h avant tout lancement manuel : le bouton de lancement n'apparaît
 * qu'après une simulation faite ici, et le serveur le revérifie de toute façon.
 */
export function RetentionActions() {
  const [simulation, setSimulation] = useState<RetentionSimulation | null>(null);
  const [loading, setLoading] = useState<'simulate' | 'run' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const doSimulate = async () => {
    setLoading('simulate');
    try {
      setSimulation(await simulateRetention());
      setConfirming(false);
    } catch (e: unknown) {
      showActionError(e, 'Simulation impossible');
    } finally {
      setLoading(null);
    }
  };

  const doRun = async () => {
    setLoading('run');
    try {
      const r = await api.post<RetentionRunResult>('/admin/retention/run', { dryRun: false });
      toast({
        title: 'Anonymisation effectuée',
        description: `${r.anonymized} bon(s) anonymisé(s), ${r.attachmentsPurged + r.oldAttachmentsPurged} pièce(s) jointe(s) purgée(s).`,
        variant: 'success',
      });
      setSimulation(null);
      setConfirming(false);
    } catch (e: unknown) {
      showActionError(e, 'Échec de l’anonymisation');
    } finally {
      setLoading(null);
    }
  };

  const fresh = isSimulationFresh(simulation);

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          L’anonymisation purge définitivement les données personnelles (email, signatures, IP) et
          <strong> détruit les preuves (PDF, archives, pièces jointes)</strong> des bons clôturés/annulés
          plus anciens que la durée configurée. La référence, les dates et le statut sont conservés. Action irréversible.
          Une simulation de moins de 24 h est obligatoire avant tout lancement manuel.
        </p>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={doSimulate} disabled={loading !== null}>
        {loading === 'simulate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        Simuler
      </Button>

      {simulation && fresh && <RetentionSimulationSummary simulation={simulation} />}

      {simulation && fresh && simulation.bons > 0 && (
        confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-destructive font-medium">Confirmer l’anonymisation de {simulation.bons} bon(s) ?</span>
            <Button type="button" variant="destructive" size="sm" onClick={doRun} disabled={loading !== null}>
              {loading === 'run' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldX className="h-3.5 w-3.5" />}
              Oui, anonymiser définitivement
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={loading !== null}>
              Annuler
            </Button>
          </div>
        ) : (
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirming(true)}>
            <ShieldX className="h-3.5 w-3.5" /> Lancer l’anonymisation
          </Button>
        )
      )}
    </div>
  );
}

/** Purge technique manuelle : liens de signature expirés et vieux journaux d'audit. */
export function TechnicalPurgeActions() {
  const [stats, setStats] = useState<RetentionStats | null>(null);
  const [loading, setLoading] = useState<'stats' | 'purge' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loadStats = async () => {
    setLoading('stats');
    try {
      setStats(await api.get<RetentionStats>('/admin/retention/stats'));
    } catch (e: unknown) {
      showActionError(e, 'Statistiques indisponibles');
    } finally {
      setLoading(null);
    }
  };

  const doPurge = async () => {
    setLoading('purge');
    try {
      const r = await api.post<{ ok: boolean; expiredTokens: number; oldAuditLogs: number }>(
        '/admin/retention/purge',
        {},
      );
      toast({
        title: 'Purge technique effectuée',
        description: `${r.expiredTokens} token(s) expiré(s) et ${r.oldAuditLogs} journal/aux d’audit supprimé(s).`,
        variant: 'success',
      });
      setConfirming(false);
      await loadStats();
    } catch (e: unknown) {
      showActionError(e, 'Échec de la purge technique');
    } finally {
      setLoading(null);
    }
  };

  const hasPurgeable = stats && (stats.purgeable.expiredTokens > 0 || stats.purgeable.oldAuditLogs > 0);

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Purge technique</h3>
        <p className="text-xs text-muted-foreground">
          Supprime les tokens de signature expirés (jamais signés) et les journaux d’audit au-delà de la durée légale.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={loadStats} disabled={loading !== null}>
          {loading === 'stats' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Statistiques
        </Button>
        {stats && (
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{stats.purgeable.expiredTokens}</strong> token(s) expiré(s),{' '}
            <strong className="text-foreground">{stats.purgeable.oldAuditLogs}</strong> log(s) d’audit purgeable(s)
          </span>
        )}
      </div>

      {hasPurgeable && (
        confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-destructive font-medium">Confirmer la purge technique ?</span>
            <Button type="button" variant="destructive" size="sm" onClick={doPurge} disabled={loading !== null}>
              {loading === 'purge' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldX className="h-3.5 w-3.5" />}
              Oui, purger
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={loading !== null}>
              Annuler
            </Button>
          </div>
        ) : (
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirming(true)}>
            <ShieldX className="h-3.5 w-3.5" /> Lancer la purge technique
          </Button>
        )
      )}
    </div>
  );
}
