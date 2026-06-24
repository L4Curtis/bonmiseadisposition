import { useState } from 'react';
import { ConfigSection } from '@/components/admin/ConfigSection';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, Eye, Loader2, ShieldX } from 'lucide-react';

interface RetentionResult {
  eligible: number;
  anonymized: number;
  attachmentsPurged: number;
  cutoff: string;
  dryRun: boolean;
}

function RetentionActions() {
  const [preview, setPreview] = useState<RetentionResult | null>(null);
  const [loading, setLoading] = useState<'preview' | 'run' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const doPreview = async () => {
    setLoading('preview');
    try {
      setPreview(await api.get<RetentionResult>('/admin/retention/preview'));
    } catch {
      toast({ title: 'Aperçu impossible', variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const doRun = async () => {
    setLoading('run');
    try {
      const r = await api.post<RetentionResult>('/admin/retention/run', { dryRun: false });
      toast({
        title: 'Anonymisation effectuée',
        description: `${r.anonymized} bon(s) anonymisé(s), ${r.attachmentsPurged} pièce(s) jointe(s) purgée(s).`,
        variant: 'success',
      });
      setPreview(null);
      setConfirming(false);
    } catch {
      toast({ title: 'Échec de l’anonymisation', variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/15 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          L’anonymisation purge définitivement les données personnelles (email, signatures, IP) et
          <strong> détruit les preuves (PDF, archives, pièces jointes)</strong> des bons clôturés/annulés
          plus anciens que la durée configurée. La référence, les dates et le statut sont conservés. Action irréversible.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={doPreview} disabled={loading !== null}>
          {loading === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Aperçu
        </Button>
        {preview && (
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{preview.eligible}</strong> bon(s) éligible(s)
            {' '}(antérieurs au {new Date(preview.cutoff).toLocaleDateString('fr-FR')})
          </span>
        )}
      </div>

      {preview && preview.eligible > 0 && (
        confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-red-600 font-medium">Confirmer l’anonymisation de {preview.eligible} bon(s) ?</span>
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

export function ConfigRetentionPage() {
  return (
    <ConfigSection
      title="Rétention RGPD"
      category="retention"
      fields={[
        { key: 'enabled', label: 'Anonymisation automatique (cron hebdomadaire)', toggle: true },
        { key: 'anonymize_months', label: 'Anonymiser après (mois)', placeholder: '36', type: 'number' },
        { key: 'attachment_months', label: 'Purge pièces jointes après (mois)', placeholder: '36', type: 'number' },
      ]}
      footer={<RetentionActions />}
    />
  );
}
