import { AlertOctagon, AlertTriangle, Archive, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ContestationDialog } from '@/components/ContestationDialog';
import { usePortal } from './portail/hooks/usePortal';
import type { DocumentToSign } from './portail/lib/portal-classification';
import { BonsSkeleton } from './portail/components/BonsSkeleton';
import { InCorrectionSection, ToSignSection } from './portail/components/ToSignSection';
import { HeldEquipmentSection } from './portail/components/HeldEquipmentSection';
import { BonsSection } from './portail/components/BonsSection';

/** Bandeau « N documents à signer » : un seul document signable ouvre
 *  directement sa signature (R-058), sinon il mène à la section. */
function ToSignBanner({ documents }: { documents: readonly DocumentToSign[] }) {
  const count = documents.length;
  const single = count === 1 && documents[0].token ? documents[0].token : null;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Vous avez {count} document{count > 1 ? 's' : ''} à signer.
      </span>
      <a
        href={single ? `/signer/${single}` : '#a-signer'}
        className="min-h-11 inline-flex items-center justify-center rounded-lg bg-warning px-4 font-semibold text-warning-foreground"
      >
        {single ? 'Signer maintenant' : 'Voir les documents'}
      </a>
    </div>
  );
}

// ─── Page « Mes équipements » (portail du collaborateur) ────────────────────

export function PortailCollaborateur() {
  const portal = usePortal();
  const { groups } = portal;

  if (portal.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <BonsSkeleton />
      </div>
    );
  }

  if (portal.loadError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-8 text-center" role="alert">
          <XCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
          <p className="text-sm text-destructive">{portal.loadError}</p>
          <Button variant="outline" onClick={portal.reload} className="mt-4 min-h-11">
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const heldCount = groups.held.length;
  // Le bandeau compte exactement les cartes de « À signer » ; un document en
  // cours de correction a son propre bloc et n'y figure pas.
  return (
    <div className="space-y-6">
      {groups.toSign.length > 0 && <ToSignBanner documents={groups.toSign} />}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes équipements</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {heldCount === 0
            ? 'Aucun équipement chez vous en ce moment.'
            : `${heldCount} équipement${heldCount > 1 ? 's' : ''} chez vous.`}
        </p>
      </div>

      {groups.toSign.length > 0 && <ToSignSection documents={groups.toSign} onContest={portal.setContestTarget} />}

      {groups.inCorrection.length > 0 && (
        <InCorrectionSection documents={groups.inCorrection} onContest={portal.setContestTarget} />
      )}

      {portal.bonCount > 0 && <HeldEquipmentSection items={groups.held} />}

      {groups.contested.length > 0 && (
        <BonsSection
          kind="contested"
          title="Contestés"
          icon={<AlertOctagon className="h-4 w-4" />}
          bons={groups.contested}
          contestationOf={portal.contestationOf}
          onContest={portal.setContestTarget}
        />
      )}
      {groups.current.length > 0 && (
        <BonsSection
          kind="current"
          title="Bons en cours"
          icon={<CheckCircle2 className="h-4 w-4" />}
          bons={groups.current}
          contestationOf={portal.contestationOf}
          onContest={portal.setContestTarget}
        />
      )}
      {groups.history.length > 0 && (
        <BonsSection
          kind="history"
          title="Historique"
          icon={<Archive className="h-4 w-4" />}
          bons={groups.history}
          contestationOf={portal.contestationOf}
          onContest={portal.setContestTarget}
        />
      )}

      {portal.bonCount === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Aucun bon n'est encore associé à votre compte.
          </CardContent>
        </Card>
      )}

      <ContestationDialog
        bonId={portal.contestTarget?.bon.id ?? null}
        bonRef={portal.contestTarget?.bon.reference}
        document={portal.contestTarget?.document}
        open={!!portal.contestTarget}
        onOpenChange={(open) => {
          if (!open) portal.setContestTarget(null);
        }}
        onSuccess={portal.onContested}
      />
    </div>
  );
}
