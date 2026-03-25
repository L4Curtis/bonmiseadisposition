import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { XCircle } from 'lucide-react';
import { useBonActions } from './detail/useBonActions';
import { BonDetailHeader } from './detail/BonDetailHeader';
import { BonInfoCards } from './detail/BonInfoCards';
import { BonSignatures } from './detail/BonSignatures';
import { BonEquipmentTable } from './detail/BonEquipmentTable';
import { BonNotesCard } from './detail/BonNotesCard';
import { BonPdfSnapshots } from './detail/BonPdfSnapshots';
import { BonModals } from './detail/BonModals';

// ─── Page principale ──────────────────────────────────────────────────────────

export function BonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isItStaff = currentUser?.isItStaff ?? false;

  const actions = useBonActions(id);
  const { bon, loading, loadError, actionLoading, pdfLoading, pdfSnapshots } = actions;

  useEffect(() => { actions.load(); }, [id]);

  // ── IT sign trigger helpers ────────────────────────────────────────────────

  const handleSend = isItStaff
    ? () => actions.triggerWithItSign(
        'mise_disposition',
        'Apposez votre cachet pour certifier la remise des équipements. L\'email de signature sera ensuite envoyé au collaborateur.',
        actions.doSend,
      )
    : () => actions.doSend();

  const handleInPersonMise = isItStaff
    ? () => actions.triggerWithItSign(
        'mise_disposition',
        'Apposez votre cachet pour certifier la remise, puis donnez le lien de signature au collaborateur.',
        () => actions.doInPerson('mise_disposition'),
      )
    : () => actions.doInPerson('mise_disposition');

  const handleRestitutionConfirm = (selectedIds: string[]) => {
    if (isItStaff) {
      actions.setShowRestitutionModal(false);
      actions.triggerWithItSign(
        'restitution',
        'Apposez votre cachet pour confirmer la restitution des équipements. L\'email sera ensuite envoyé au collaborateur.',
        () => actions.doRestitution(selectedIds),
      );
    } else {
      actions.doRestitution(selectedIds);
    }
  };

  const handleInPersonRestitution = isItStaff
    ? () => actions.triggerWithItSign(
        'restitution',
        'Apposez votre cachet pour la restitution, puis donnez le lien de signature au collaborateur.',
        () => actions.doInPerson('restitution'),
      )
    : () => actions.doInPerson('restitution');

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16" aria-live="polite">
        <div className="h-7 w-7 animate-spin motion-reduce:animate-none rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent" role="status">
          <span className="sr-only">Chargement du bon</span>
        </div>
      </div>
    );
  }

  if (!bon) {
    return (
      <div className="text-center py-16 text-muted-foreground/70" role="alert">
        {loadError ? (
          <>
            <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
            <p className="text-red-600">{loadError}</p>
          </>
        ) : (
          <p>Bon introuvable</p>
        )}
        <button className="mt-3 text-blue-600 text-sm hover:underline" onClick={() => navigate('/bons')}>
          Retour à la liste
        </button>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const civiliteLabel = bon.civilite === 'mme' ? 'Mme' : 'M.';
  const isDraft = bon.status === 'draft';
  const isActive = bon.status === 'active';
  const isPartiallyReturned = bon.status === 'partially_returned';
  const isCancellable = !['archived', 'cancelled', 'contested'].includes(bon.status);
  const isSentWaiting = ['sent_mise_dispo', 'sent_restitution'].includes(bon.status);
  const showEquipmentStatus = ['sent_restitution', 'partially_returned', 'archived'].includes(bon.status);
  const hasPendingPvCloture = bon.signatures?.some(
    (s) => s.type === 'pv_cloture' && !s.signed && new Date() < new Date(s.tokenExpiresAt),
  ) ?? false;
  const hasNotReturnedEquipment = bon.equipments.some((eq) => eq.notReturned);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-4xl">
      <BonDetailHeader
        bon={bon}
        bonId={id!}
        isDraft={isDraft}
        isActive={isActive}
        isPartiallyReturned={isPartiallyReturned}
        isCancellable={isCancellable}
        isItStaff={isItStaff}
        isSentWaiting={isSentWaiting}
        hasPendingPvCloture={hasPendingPvCloture}
        hasNotReturnedEquipment={hasNotReturnedEquipment}
        actionLoading={actionLoading}
        pdfLoading={pdfLoading}
        onDownloadPdf={() => actions.downloadPdf(actions.headerPdfType(), 'header')}
        onEdit={() => navigate(`/bons/${id}/edit`)}
        onSend={handleSend}
        onInPersonMise={handleInPersonMise}
        onInitiateRestitution={() => actions.setShowRestitutionModal(true)}
        onInPersonRestitution={handleInPersonRestitution}
        onDeclareNotReturned={() => actions.setShowNotReturnedModal(true)}
        onMarkFound={() => actions.setShowMarkFoundModal(true)}
        onResend={() => actions.doResend()}
        onCancel={() => actions.setConfirmCancel(true)}
      />

      <BonInfoCards bon={bon} civiliteLabel={civiliteLabel} />

      {bon.signatures && bon.signatures.length > 0 && (
        <BonSignatures
          signatures={bon.signatures}
          pdfLoading={pdfLoading}
          onDownloadPdf={actions.downloadPdf}
        />
      )}

      <BonEquipmentTable
        equipments={bon.equipments}
        showEquipmentStatus={showEquipmentStatus}
      />

      {bon.notes && <BonNotesCard notes={bon.notes} />}

      <BonPdfSnapshots
        snapshots={pdfSnapshots}
        pdfLoading={pdfLoading}
        onDownloadSnapshot={actions.downloadPdfSnapshot}
      />

      <BonModals
        bon={bon}
        confirmCancel={actions.confirmCancel}
        onCancelConfirm={actions.doCancel}
        onCancelDismiss={() => actions.setConfirmCancel(false)}
        inPersonModal={actions.inPersonModal}
        onInPersonClose={() => actions.setInPersonModal(null)}
        pendingItAction={actions.pendingItAction}
        onItSignClose={() => actions.setPendingItAction(null)}
        onItSigned={async () => {
          const action = actions.pendingItAction;
          actions.setPendingItAction(null);
          if (action) await action.onSigned();
        }}
        showRestitutionModal={actions.showRestitutionModal}
        onRestitutionConfirm={handleRestitutionConfirm}
        onRestitutionCancel={() => actions.setShowRestitutionModal(false)}
        restitutionLoading={actionLoading === 'restitution'}
        showNotReturnedModal={actions.showNotReturnedModal}
        onNotReturnedConfirm={actions.doDeclareNotReturned}
        onNotReturnedCancel={() => actions.setShowNotReturnedModal(false)}
        notReturnedLoading={actionLoading === 'notreturned'}
        showMarkFoundModal={actions.showMarkFoundModal}
        onMarkFoundConfirm={actions.doMarkFound}
        onMarkFoundCancel={() => actions.setShowMarkFoundModal(false)}
        markFoundLoading={actionLoading === 'markfound'}
        resendConfirmSentAt={actions.resendConfirmSentAt}
        onResendForce={() => actions.doResend(true)}
        onResendDismiss={() => actions.setResendConfirmSentAt(null)}
      />
    </div>
  );
}
