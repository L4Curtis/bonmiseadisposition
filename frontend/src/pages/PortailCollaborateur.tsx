import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, XCircle, AlertTriangle } from 'lucide-react';
import { ContestationDialog } from '@/components/ContestationDialog';
import { useMesBons } from './portail/hooks/useMesBons';
import { groupBons } from './portail/lib/bonsFilters';
import { BonsSkeleton } from './portail/components/BonsSkeleton';
import { PendingBonsSection } from './portail/components/PendingBonsSection';
import { ActiveBonsSection } from './portail/components/ActiveBonsSection';
import { ContestedBonsSection } from './portail/components/ContestedBonsSection';
import { HistoryTable } from './portail/components/HistoryTable';
import type { BonCollab } from './portail/types';

// ─── Page principale ─────────────────────────────────────────────────────────

export function PortailCollaborateur() {
  const navigate = useNavigate();
  const { bons, loading, loadError, contestingBon, reload, setContestingBon, handleContestationSuccess } = useMesBons();

  if (loading) return (
    <div className="space-y-6 ">
      <Skeleton className="h-8 w-48" />
      <BonsSkeleton />
    </div>
  );

  if (loadError) return (
    <div className="">
      <Card className="border-destructive/30">
        <CardContent className="p-8 text-center" role="alert">
          <XCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={reload} className="mt-4">Réessayer</Button>
        </CardContent>
      </Card>
    </div>
  );

  const { pending, active, contested, others } = groupBons(bons);

  const openBon = (bon: BonCollab) => navigate(`/mes-bons/${bon.id}`);

  return (
    <div className="space-y-6 ">
      {pending.length > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Vous avez {pending.length} document{pending.length > 1 ? 's' : ''} à signer.{' '}
            <a href="#a-signer" className="font-semibold underline underline-offset-2">Voir</a>
          </span>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes équipements</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {bons.length} bon{bons.length > 1 ? 's' : ''} associé{bons.length > 1 ? 's' : ''} à votre compte
        </p>
      </div>

      {bons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Vous n'avez aucun bon pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pending.length > 0 && <PendingBonsSection bons={pending} onDetails={openBon} />}

          {active.length > 0 && (
            <ActiveBonsSection bons={active} onOpen={openBon} onContest={setContestingBon} />
          )}

          {contested.length > 0 && <ContestedBonsSection bons={contested} onOpen={openBon} />}

          {others.length > 0 && <HistoryTable bons={others} onOpen={openBon} />}
        </>
      )}

      <ContestationDialog
        bonId={contestingBon?.id ?? null}
        bonRef={contestingBon?.reference}
        open={!!contestingBon}
        onOpenChange={(open) => { if (!open) setContestingBon(null); }}
        onSuccess={handleContestationSuccess}
      />
    </div>
  );
}
