import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { XCircle, AlertTriangle } from 'lucide-react';
import { useBonActions } from './detail/useBonActions';
import { BonDetailHeader } from './detail/BonDetailHeader';
import { isDeliverableEmail } from '@/lib/email';
import { BonInfoCards } from './detail/BonInfoCards';
import { BonSignatures } from './detail/BonSignatures';
import { BonEquipmentTable } from './detail/BonEquipmentTable';
import { BonNotesCard } from './detail/BonNotesCard';
import { BonPdfSnapshots } from './detail/BonPdfSnapshots';
import { BonAttachments } from './detail/BonAttachments';
import { BonIntegrity } from './detail/BonIntegrity';
import { BonNotificationLogs } from './detail/BonNotificationLogs';
import { BonModals } from './detail/BonModals';

// ─── Page principale ──────────────────────────────────────────────────────────

export function BonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isItStaff = currentUser?.isItStaff ?? false;
  const isAdmin = currentUser?.role === 'admin';

  const actions = useBonActions(id, { isItStaff });
  const { bon, loading, loadError, actionLoading, pdfLoading, pdfSnapshots, notifLogs } = actions;

  useEffect(() => { actions.load(); }, [id]);

  // ── IT sign trigger helpers ────────────────────────────────────────────────
  // Mise à disposition : cachet PUIS envoi/présentiel (le cachet certifie la
  // remise avant que l'email ne parte). Restitution : ordre inverse (voir
  // handleRestitutionConfirm) — le cachet doit être apposé APRÈS que les
  // équipements sont marqués rendus, sinon son PDF les montre « en attente ».

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

  /** Restitution : on marque d'abord les équipements rendus (doRestitution),
   *  puis seulement on demande le cachet IT — pour que le PDF du cachet
   *  reflète l'état réel des équipements plutôt que « tous en attente ». Si
   *  la restitution échoue, on ne demande pas de cachet. */
  const handleRestitutionConfirm = async (selectedIds: string[]) => {
    actions.setShowRestitutionModal(false);
    if (isItStaff) {
      const ok = await actions.doRestitution(selectedIds);
      if (ok) {
        actions.triggerWithItSign(
          'restitution',
          'La restitution a été enregistrée. Apposez votre cachet pour la confirmer — l\'email sera ensuite envoyé au collaborateur. Si vous fermez cette fenêtre sans signer, vous pourrez apposer le cachet plus tard depuis la fiche du bon.',
          // L'action (initiate-restitution) est déjà faite : il ne reste que
          // le cachet, déjà posé par ItSignModal à ce stade.
          async () => true,
        );
      }
    } else {
      await actions.doRestitution(selectedIds);
    }
  };

  const handleInPersonRestitution = isItStaff
    ? () => actions.triggerWithItSign(
        'restitution',
        'Apposez votre cachet pour la restitution, puis donnez le lien de signature au collaborateur.',
        () => actions.doInPerson('restitution'),
      )
    : () => actions.doInPerson('restitution');

  /** Rattrapage : pose le cachet IT de restitution seul, sans redéclencher
   *  l'action de restitution (déjà actée) — pour le cas où la modale de
   *  cachet a été fermée sans signer juste après la restitution. */
  const handleApplyRestitutionItCachet = () =>
    actions.triggerWithItSign(
      'restitution',
      'La restitution a déjà été enregistrée pour ce bon. Apposez votre cachet pour la confirmer.',
      async () => true,
    );

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
            <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive/70" />
            <p className="text-destructive">{loadError}</p>
          </>
        ) : (
          <p>Bon introuvable</p>
        )}
        <button className="mt-3 text-primary text-sm hover:underline" onClick={() => navigate('/bons')}>
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
  // Décision produit : l'annulation n'est plus permise une fois qu'une
  // signature a pu intervenir (active, sent_restitution, partially_returned,
  // archived, contested, cancelled) — seuls les bons pas encore engagés
  // (brouillon, en attente de la première signature) restent annulables.
  // Le backend refuse aussi l'annulation hors de ces statuts.
  const isCancellable = ['draft', 'sent_mise_dispo'].includes(bon.status);
  const isSentWaiting = ['sent_mise_dispo', 'sent_restitution'].includes(bon.status);
  const showEquipmentStatus = ['sent_restitution', 'partially_returned', 'archived'].includes(bon.status);
  const hasPendingPvCloture = bon.signatures?.some(
    (s) => s.type === 'pv_cloture' && !s.signed && new Date() < new Date(s.tokenExpiresAt),
  ) ?? false;
  const hasNotReturnedEquipment = bon.equipments.some((eq) => eq.notReturned);
  // Clôture unilatérale possible : en attente de signature, ou PV en attente
  // (partially_returned avec tous les équipements résolus)
  const canCloseUnilateral =
    isSentWaiting ||
    (isPartiallyReturned && bon.equipments.every((eq) => eq.returnedAt || eq.notReturned));
  // Signature présentielle en cours : le lien (modale fermée par erreur) peut
  // être réaffiché — la ré-initiation régénère un token proprement
  const lastUnsignedSig = [...(bon.signatures ?? [])]
    .filter((s) => !s.signed && s.type !== 'it_cachet')
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
  const hasPendingInPerson =
    isSentWaiting && !!lastUnsignedSig?.isInPerson && new Date(lastUnsignedSig.tokenExpiresAt) > new Date();
  const handleShowInPerson = () =>
    actions.doInPerson(bon.status === 'sent_restitution' ? 'restitution' : 'mise_disposition');

  // Rattrapage : la restitution peut être actée sans que son cachet IT soit
  // jamais posé (modale de cachet fermée sans signer). On le détecte pour
  // proposer de l'apposer depuis la fiche plutôt que de laisser le bon sans
  // recours. Priorité à `pdfType` (exposé par le backend) ; à défaut, repli
  // sur « aucun it_cachet postérieur à la dernière signature mise à
  // disposition » pour les données antérieures à ce champ.
  const lastMiseDispoSig = [...(bon.signatures ?? [])]
    .filter((s) => s.type === 'mise_disposition' && s.signed)
    .sort((a, b) => new Date(b.signedAt ?? b.createdAt ?? 0).getTime() - new Date(a.signedAt ?? a.createdAt ?? 0).getTime())[0];
  const hasRestitutionItCachet = (bon.signatures ?? []).some((s) => {
    if (s.type !== 'it_cachet' || !s.signed) return false;
    if (s.pdfType) return s.pdfType === 'restitution';
    if (!lastMiseDispoSig) return false;
    const miseDispoTime = new Date(lastMiseDispoSig.signedAt ?? lastMiseDispoSig.createdAt ?? 0).getTime();
    return new Date(s.createdAt ?? s.signedAt ?? 0).getTime() > miseDispoTime;
  });
  const needsRestitutionItCachet =
    isItStaff &&
    ['sent_restitution', 'partially_returned'].includes(bon.status) &&
    !hasRestitutionItCachet;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <BonDetailHeader
        bon={bon}
        bonId={id!}
        isDraft={isDraft}
        isActive={isActive}
        isPartiallyReturned={isPartiallyReturned}
        isCancellable={isCancellable}
        canInitiateRestitution={isActive || isPartiallyReturned}
        isItStaff={isItStaff}
        isSentWaiting={isSentWaiting}
        hasPendingPvCloture={hasPendingPvCloture}
        hasNotReturnedEquipment={hasNotReturnedEquipment}
        canCloseUnilateral={canCloseUnilateral}
        hasPendingInPerson={hasPendingInPerson}
        onShowInPerson={handleShowInPerson}
        needsRestitutionItCachet={needsRestitutionItCachet}
        onApplyRestitutionItCachet={handleApplyRestitutionItCachet}
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
        onCloseUnilateral={() => actions.setShowCloseUnilateralModal(true)}
        onCancel={() => actions.setConfirmCancel(true)}
      />
      {!isDeliverableEmail(bon.collaborateurEmail) && !['archived', 'cancelled'].includes(bon.status) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              Adresse email du collaborateur non valide ({bon.collaborateurEmail || 'vide'})
            </p>
            <p className="text-xs opacity-90">
              Aucun lien de signature ne peut lui être envoyé par email : utilisez la signature présentielle, ou
              corrigez l'adresse du compte.
            </p>
          </div>
        </div>
      )}

      <BonInfoCards bon={bon} civiliteLabel={civiliteLabel} />

      {bon.signatures && bon.signatures.length > 0 && (
        <BonSignatures
          signatures={bon.signatures}
        />
      )}

      <BonEquipmentTable
        equipments={bon.equipments}
        showEquipmentStatus={showEquipmentStatus}
        bonId={bon.id}
      />

      {bon.notes && <BonNotesCard notes={bon.notes} />}

      <BonAttachments
        bonId={bon.id}
        canManage
        defaultStage={['active', 'sent_restitution', 'partially_returned', 'archived'].includes(bon.status) ? 'restitution' : 'mise_disposition'}
      />

      <BonPdfSnapshots
        snapshots={pdfSnapshots}
        pdfLoading={pdfLoading}
        onDownloadSnapshot={actions.downloadPdfSnapshot}
        missing={actions.missingSnapshots}
        isAdmin={isAdmin}
        onRegenerateMissing={actions.regenerateMissingSnapshots}
        regenerating={actions.regeneratingSnapshots}
      />

      {bon.signatures && bon.signatures.some((s) => s.signed) && <BonIntegrity bonId={bon.id} />}

      {isItStaff && <BonNotificationLogs logs={notifLogs} />}

      <BonModals
        bon={bon}
        confirmCancel={actions.confirmCancel}
        onCancelConfirm={actions.doCancel}
        onCancelDismiss={() => actions.setConfirmCancel(false)}
        cancelLoading={actionLoading === 'cancel'}
        inPersonModal={actions.inPersonModal}
        onInPersonClose={() => actions.setInPersonModal(null)}
        pendingItAction={actions.pendingItAction}
        onItSignClose={() => actions.setPendingItAction(null)}
        onItSigned={async () => {
          const action = actions.pendingItAction;
          actions.setPendingItAction(null);
          if (!action) return;
          // Le cachet est déjà en base à ce stade (ItSignModal l'a posé avant
          // d'appeler onSigned). Si l'action qui suit échoue, on garde une
          // trace « à relancer sans re-signer » — sauf si l'échec est en
          // réalité un conflit de numéro de série, déjà pris en charge par sa
          // propre modale de confirmation.
          const ok = await action.onSigned();
          if (!ok && !actions.sendSerialConflicts) {
            actions.setFailedItAction({ pdfType: action.pdfType, retry: action.onSigned });
          }
        }}
        failedItAction={actions.failedItAction}
        onRetryFailedItAction={actions.retryFailedItAction}
        onDismissFailedItAction={() => actions.setFailedItAction(null)}
        retryingFailedItAction={actions.retryingFailedItAction}
        sendSerialConflicts={actions.sendSerialConflicts}
        onSendConflictsConfirm={actions.confirmSendDespiteConflicts}
        onSendConflictsDismiss={() => actions.setSendSerialConflicts(null)}
        sendLoading={actionLoading === 'send'}
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
        resendLoading={actionLoading === 'resend'}
        showCloseUnilateralModal={actions.showCloseUnilateralModal}
        onCloseUnilateralConfirm={actions.doCloseUnilateral}
        onCloseUnilateralCancel={() => actions.setShowCloseUnilateralModal(false)}
        closeUnilateralLoading={actionLoading === 'closeunilateral'}
      />
    </div>
  );
}
