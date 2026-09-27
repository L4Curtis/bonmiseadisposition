import { ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { showActionError } from '@/lib/errors';
import type { LinkSignatureType, SendChecksResponse } from '@/contracts';
import { bonApi, type SendConfirmations } from '../bon-api';
import { documentInSentence } from '../bon-lexicon';
import type { BonFiche } from '../types';
import type { Channel, SetActionLoading, SetDialog } from './bon-dialog';

export interface FlowDeps {
  readonly id: string | undefined;
  readonly bon: BonFiche | null;
  readonly reload: () => void;
  readonly setDialog: SetDialog;
  readonly setActionLoading: SetActionLoading;
}

/** Destinataire des liens : l'adresse ACTUELLE du compte du collaborateur. */
function recipientName(bon: BonFiche | null): string {
  return bon?.collaborateur.displayName ?? 'le collaborateur';
}

/** Pour une remise ou un lien : signature IT d'abord (si elle manque), puis la suite. */
export function requireItSignature(
  deps: FlowDeps,
  pdfType: 'mise_disposition' | 'restitution',
  description: string,
  next: () => Promise<boolean>,
  dismissNotice?: string,
) {
  deps.setDialog({ kind: 'it-sign', action: { pdfType, description, onSigned: next, dismissNotice } });
}

/**
 * Parcours des liens de signature : remise (email ou guichet, contrôles de
 * numéros d'abord), renvoi du lien du document en attente, lien au guichet.
 * Toujours dans l'ordre imposé par le serveur : contrôles → signature IT → lien.
 */
export function useLinkFlows(deps: FlowDeps) {
  const { id, bon, reload, setDialog, setActionLoading } = deps;

  const sendByEmail = async (confirmations: SendConfirmations): Promise<boolean> => {
    if (!id) return false;
    setActionLoading('send');
    try {
      await bonApi.send(id, confirmations);
      toast({ title: 'Signature IT enregistrée', description: `Lien de signature envoyé par email à ${recipientName(bon)}.` });
      reload();
      return true;
    } catch (e: unknown) {
      showActionError(e, "Erreur lors de l'envoi du bon");
      return false;
    } finally { setActionLoading(null); }
  };

  const openInPerson = async (type: LinkSignatureType, confirmations: SendConfirmations = {}): Promise<boolean> => {
    if (!id) return false;
    setActionLoading('inperson');
    try {
      const res = await bonApi.inPerson(id, type, confirmations);
      setDialog({ kind: 'in-person', type, token: res.token });
      reload();
      return true;
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors de la préparation de la signature au guichet');
      return false;
    } finally { setActionLoading(null); }
  };

  /** Remise après les contrôles (confirmés s'il le fallait) : signature IT, puis lien. */
  const proceedHandover = (channel: Channel, confirmations: SendConfirmations) => {
    const next = channel === 'email'
      ? () => sendByEmail(confirmations)
      : () => openInPerson('mise_disposition', confirmations);
    requireItSignature(
      deps,
      'mise_disposition',
      channel === 'email'
        ? 'Votre signature IT certifie la remise des équipements. Le lien de signature partira ensuite par email.'
        : 'Votre signature IT certifie la remise des équipements. Le lien de signature s’affichera ensuite pour le collaborateur.',
      next,
    );
  };

  /** « Envoyer » ou « Faire signer au guichet » : contrôles des numéros AVANT la signature IT (R-003). */
  const startHandover = async (channel: Channel) => {
    if (!id) return;
    setActionLoading('checks');
    let checks: SendChecksResponse;
    try {
      checks = await bonApi.sendChecks(id);
    } catch (e: unknown) {
      showActionError(e, 'Vérification des numéros impossible');
      return;
    } finally { setActionLoading(null); }
    if (checks.missingSerials.length > 0 || checks.serialConflicts.length > 0) {
      setDialog({ kind: 'send-checks', checks, channel });
      return;
    }
    proceedHandover(channel, {});
  };

  const resend = async (force = false): Promise<boolean> => {
    if (!id) return false;
    setActionLoading('resend');
    try {
      await bonApi.resend(id, force);
      toast({ title: 'Lien envoyé', description: `Nouveau lien de signature envoyé par email à ${recipientName(bon)}.` });
      setDialog(null);
      reload();
      return true;
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { code?: string; sentAt?: string } | undefined;
        if (body?.code === 'token_recent' && body.sentAt) {
          setDialog({ kind: 'resend-confirm', sentAt: body.sentAt });
          return true;
        }
      }
      showActionError(e, 'Erreur lors du renvoi du lien');
      return false;
    } finally { setActionLoading(null); }
  };

  /** Lien du document en attente : signature IT d'abord si elle manque (R-022). */
  const withPendingDocument = (next: (type: LinkSignatureType) => Promise<boolean>) => {
    const pending = bon?.pendingSignature;
    if (!pending) return;
    if (pending.itSigned || pending.type === 'pv_cloture') {
      void next(pending.type);
      return;
    }
    requireItSignature(
      deps,
      pending.type,
      `Votre signature IT certifie ${documentInSentence(pending.type)} telle qu’elle apparaît sur le document. Le lien sera transmis ensuite.`,
      () => next(pending.type),
      'Aucun lien n’est parti : il sera transmis après votre signature IT.',
    );
  };

  return {
    startHandover,
    proceedHandover,
    resend,
    resendPending: () => withPendingDocument(() => resend(false)),
    showInPersonLink: () => withPendingDocument((type) => openInPerson(type)),
    openInPerson,
  };
}
