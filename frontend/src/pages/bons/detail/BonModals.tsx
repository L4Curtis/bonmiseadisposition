import { toast } from '@/hooks/use-toast';
import type { BonActions } from './useBonActions';
import type { BonFiche } from './types';
import { ConfirmModal } from './ConfirmModal';
import { InPersonModal } from './InPersonModal';
import { ItSignModal } from './ItSignModal';
import { RestitutionModal } from './RestitutionModal';
import { DeclareNotReturnedModal } from './DeclareNotReturnedModal';
import { MarkFoundModal } from './MarkFoundModal';
import { ReasonModal } from './ReasonModal';
import { SendChecksModal } from './SendChecksModal';
import { UndoReturnModal } from './UndoReturnModal';

export interface BonModalsProps {
  readonly bon: BonFiche;
  readonly actions: BonActions;
}

function minutesAgo(sentAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000);
  if (minutes < 1) return 'il y a moins d’une minute';
  return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
}

/** La fenêtre ouverte sur la fiche (une seule à la fois, voir BonDialog). */
export function BonModals({ bon, actions }: BonModalsProps) {
  const { dialog, setDialog, actionLoading } = actions;
  if (!dialog) return null;
  const close = () => setDialog(null);

  switch (dialog.kind) {
    case 'it-sign':
      return (
        <ItSignModal
          bonId={bon.id}
          reference={bon.reference}
          pdfType={dialog.action.pdfType}
          description={dialog.action.description}
          onClose={() => {
            close();
            if (dialog.action.dismissNotice) toast({ title: 'Signature IT non posée', description: dialog.action.dismissNotice });
          }}
          onSigned={async () => {
            close();
            // La signature IT est en base : si la suite échoue, on la relance sans signer à nouveau.
            const ok = await dialog.action.onSigned();
            if (!ok) setDialog({ kind: 'failed-it', failed: { pdfType: dialog.action.pdfType, retry: dialog.action.onSigned } });
            actions.reload();
          }}
        />
      );
    case 'failed-it':
      return (
        <ConfirmModal
          title="Signature IT enregistrée — suite interrompue"
          message="Votre signature IT est bien enregistrée, mais l’étape suivante (envoi du lien…) n’a pas abouti. Inutile de signer à nouveau : réessayez simplement."
          confirmLabel="Réessayer"
          onConfirm={async () => { if (await dialog.failed.retry()) close(); }}
          onCancel={close}
          loading={actionLoading !== null}
        />
      );
    case 'send-checks':
      return (
        <SendChecksModal
          checks={dialog.checks}
          onConfirm={(confirmations) => actions.proceedHandover(dialog.channel, confirmations)}
          onEdit={() => { close(); actions.goToEdit(); }}
          onCancel={close}
        />
      );
    case 'in-person':
      return <InPersonModal type={dialog.type} token={dialog.token} onClose={close} />;
    case 'restitution':
      return (
        <RestitutionModal
          equipments={bon.equipments}
          channel={dialog.channel}
          onConfirm={(ids) => void actions.confirmRestitution(ids, dialog.channel)}
          onCancel={close}
          loading={actionLoading === 'restitution'}
        />
      );
    case 'undo-return':
      return <UndoReturnModal equipments={bon.equipments} onConfirm={(ids) => void actions.undoReturn(ids)} onCancel={close} loading={actionLoading === 'undo'} />;
    case 'not-returned':
      return (
        <DeclareNotReturnedModal
          equipments={bon.equipments}
          onConfirm={(ids, reason, signature) => void actions.declareNotReturned(ids, reason, signature)}
          onCancel={close}
          loading={actionLoading === 'notreturned'}
        />
      );
    case 'mark-found':
      return (
        <MarkFoundModal
          equipments={bon.equipments}
          onConfirm={(ids, signature) => void actions.markFound(ids, signature)}
          onCancel={close}
          loading={actionLoading === 'markfound'}
          isArchived={bon.status === 'archived'}
        />
      );
    case 'reason':
      return (
        <ReasonModal
          action={dialog.action}
          reasonRequired={!(dialog.action === 'cancel' && bon.status === 'draft')}
          onConfirm={(reason) => void actions.confirmReason(dialog.action, reason)}
          onCancel={close}
          loading={actionLoading === dialog.action}
        />
      );
    case 'resend-confirm':
      return (
        <ConfirmModal
          title="Lien envoyé récemment"
          message={`Un lien de signature encore valable a été envoyé ${minutesAgo(dialog.sentAt)}. Le collaborateur l’a peut-être déjà reçu. Envoyer un nouveau lien quand même ? L’ancien ne fonctionnera plus.`}
          confirmLabel="Renvoyer quand même"
          onConfirm={() => void actions.resend(true)}
          onCancel={close}
          loading={actionLoading === 'resend'}
        />
      );
    case 'edit-sent':
      return (
        <ConfirmModal
          title="Modifier un bon déjà envoyé ?"
          message="Le lien envoyé au collaborateur ne fonctionnera plus. Après vos modifications, votre signature IT sera redemandée, puis un nouveau lien partira. La modification est tracée dans le journal d’audit."
          confirmLabel="Modifier le bon"
          onConfirm={() => { close(); actions.goToEdit(); }}
          onCancel={close}
        />
      );
  }
}
