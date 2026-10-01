import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { BonActionName } from '@/contracts';
import { useBonActions } from './detail/useBonActions';
import { BonDetailHeader } from './detail/BonDetailHeader';
import { BonActionPanel } from './detail/BonActionPanel';
import { BonAlerts } from './detail/BonAlerts';
import { BonInfoCards } from './detail/BonInfoCards';
import { BonSignatures } from './detail/BonSignatures';
import { BonEquipmentTable, showsEquipmentState } from './detail/BonEquipmentTable';
import { BonNotesCard } from './detail/BonNotesCard';
import { BonPdfSnapshots } from './detail/BonPdfSnapshots';
import { readyPvOf } from './detail/pdf-documents';
import { BonAttachments } from './detail/BonAttachments';
import { BonIntegrity } from './detail/BonIntegrity';
import { BonNotificationLogs } from './detail/BonNotificationLogs';
import { BonHistory } from './detail/BonHistory';
import { BonModals } from './detail/BonModals';
import type { BonFiche } from './detail/types';

/** Étape du formulaire de pièces jointes proposée par défaut. */
const RESTITUTION_STAGE = ['active', 'sent_restitution', 'partially_returned', 'archived'];

/** L'action est-elle proposée (et possible) sur ce bon ? Une fiche sans
 *  actions calculées (réponse d'un serveur antérieur) retombe sur le statut. */
function canRun(bon: Pick<BonFiche, 'status' | 'availableActions'>, actions: readonly BonActionName[]): boolean {
  if (!bon.availableActions) return ['active', 'partially_returned'].includes(bon.status);
  return bon.availableActions.some((a) => actions.includes(a.action) && !a.blockedReason);
}

/**
 * Liens profonds de la fiche :
 *  - `?action=restitution` (inventaire) : ouvre la restitution ;
 *  - `?action=suite` (après la modification d'un bon envoyé) : lance l'action
 *    principale (signature IT, puis nouveau lien).
 * Le paramètre est retiré ensuite, pour qu'un rechargement ne rejoue rien.
 */
function useDeepLinkAction(bon: BonFiche | null, id: string | undefined, actions: ReturnType<typeof useBonActions>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('action');
  useEffect(() => {
    if (!requested || !bon || bon.id !== id) return;
    if (requested === 'restitution') {
      if (canRun(bon, ['start_restitution', 'restitution_in_person'])) actions.setShowRestitutionModal(true);
      else toast({ title: 'Restitution impossible', description: 'L’état de ce bon ne permet pas de lancer une restitution.' });
    } else if (requested === 'suite') {
      const primary = bon.availableActions?.find((a) => a.primary && !a.blockedReason);
      if (primary) actions.run(primary.action);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('action');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, bon?.id, bon?.status, id]);
}

export function BonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isItStaff = currentUser?.isItStaff ?? false;
  const isAdmin = currentUser?.role === 'admin';

  const actions = useBonActions(id, { isItStaff });
  const { bon, loading, loadError, actionLoading, pdfLoading, pdfSnapshots, notifLogs } = actions;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { actions.load(); }, [id]);
  useDeepLinkAction(bon, id, actions);

  if (loading) {
    return (
      <div className="flex justify-center py-16" aria-live="polite">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent motion-reduce:animate-none" role="status">
          <span className="sr-only">Chargement du bon</span>
        </div>
      </div>
    );
  }

  if (!bon) {
    return (
      <div className="py-16 text-center text-muted-foreground/70" role="alert">
        {loadError ? (
          <>
            <XCircle className="mx-auto mb-2 h-8 w-8 text-destructive/70" />
            <p className="text-destructive">{loadError}</p>
          </>
        ) : (
          <p>Bon introuvable</p>
        )}
        <button className="mt-3 text-sm text-primary hover:underline" onClick={() => navigate('/bons')}>
          Retour à la liste
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BonDetailHeader bon={bon} />
      <BonActionPanel
        bon={bon}
        actionLoading={actionLoading}
        pdfLoading={pdfLoading}
        onRun={actions.run}
        onDownloadPdf={() => actions.downloadPdf(actions.headerPdfType(), 'header')}
      />
      <BonAlerts bon={bon} />
      <BonInfoCards bon={bon} />
      <BonEquipmentTable
        equipments={bon.equipments}
        showEquipmentStatus={showsEquipmentState(bon)}
        replacedBy={bon.replacedBy}
      />
      {bon.signatures?.length > 0 && (
        <BonSignatures
          signatures={bon.signatures}
          collaborateurName={bon.collaborateur?.displayName ?? 'le collaborateur'}
          collaborateurEmail={bon.collaborateur?.email ?? bon.collaborateurEmail}
          subStatus={bon.subStatus}
        />
      )}
      <BonNotesCard notes={bon.notes} internalNote={bon.internalNote} />
      <BonAttachments bonId={bon.id} canManage defaultStage={RESTITUTION_STAGE.includes(bon.status) ? 'restitution' : 'mise_disposition'} />
      <BonPdfSnapshots
        snapshots={pdfSnapshots}
        pdfLoading={pdfLoading}
        onDownloadSnapshot={actions.downloadPdfSnapshot}
        missing={actions.missingSnapshots}
        isAdmin={isAdmin}
        onRegenerateMissing={actions.regenerateMissingSnapshots}
        regenerating={actions.regeneratingSnapshots}
        readyPv={isItStaff ? readyPvOf(bon) : null}
        onDownloadReadyPv={actions.downloadReadyPv}
      />
      {bon.signatures?.some((s) => s.signed) && <BonIntegrity bonId={bon.id} />}
      {isItStaff && (
        <BonHistory bonId={bon.id} refreshKey={`${bon.updatedAt}|${bon.status}|${bon.signatures?.length ?? 0}`} />
      )}
      {isItStaff && <BonNotificationLogs logs={notifLogs} />}
      <BonModals bon={bon} actions={actions} />
    </div>
  );
}
