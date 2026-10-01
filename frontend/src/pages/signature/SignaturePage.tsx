import { useState } from 'react';
import { useParams } from 'react-router';
import { Loader2, XCircle } from 'lucide-react';
import { useSignatureCanvas } from '@/hooks/use-signature-canvas';
import { ContestationDialog } from '@/components/ContestationDialog';
import type { User } from '@/types';
import { LoginRequiredScreen, UnauthorizedScreen } from './components/AuthScreens';
import { StatusScreen } from './components/StatusScreen';
import { BonSummary } from './components/BonSummary';
import { SignatureFormCard } from './components/SignatureFormCard';
import { FreshlySignedScreen, AlreadySignedScreen } from './components/SignatureSuccess';
import {
  ClosedBonScreen,
  ContestationSentScreen,
  ExpiredLinkScreen,
  InvalidatedLinkScreen,
} from './components/LinkStatusScreens';
import { useSignatureToken } from './hooks/useSignatureToken';
import { useDocumentActions } from './hooks/useDocumentActions';
import { signatureTypeLabel } from './lib/signatureLabels';
import type { PendingSignatureData } from './types';

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" />
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}

/** Discordance entre le compte connecté et le destinataire d'un lien à
 *  distance (même normalisation que le serveur : minuscules, sans espaces). */
function hasEmailMismatch(user: User, data: PendingSignatureData): boolean {
  const expected = data.bon.collaborateurEmail;
  return (
    !!user.email &&
    !data.signature.isInPerson &&
    !!expected &&
    user.email.toLowerCase().trim() !== expected.toLowerCase().trim()
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function SignaturePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [luApprouve, setLuApprouve] = useState(false);
  const [contesting, setContesting] = useState(false);
  const [contested, setContested] = useState(false);

  const tokenState = useSignatureToken(token);
  const { currentUser, checkingAuth, loading, data, error } = tokenState;
  const documents = useDocumentActions(token);
  // Le cadre plein écran n'a pas les proportions de l'image exportée : le
  // canevas suit son cadre au lieu d'être étiré.
  const canvas = useSignatureCanvas({ followFrame: true });

  if (checkingAuth) return <Loading />;
  // Pas connecté : l'invitation à se connecter, tout de suite.
  if (!currentUser) {
    return <LoginRequiredScreen signerReturnTo={tokenState.signerReturnTo} />;
  }
  if (loading) return <Loading />;
  if (error || !data) {
    return (
      <StatusScreen
        icon={<XCircle className="h-12 w-12 text-destructive" />}
        title="Lien invalide"
        message={error ?? "Ce lien de signature n'existe pas."}
      />
    );
  }

  // Ordre voulu par le serveur : annulé / contesté passent avant « déjà
  // signé » et « expiré ».
  switch (data.status) {
    case 'unauthorized':
      return <UnauthorizedScreen currentUser={currentUser} onChangeAccount={tokenState.handleChangeAccount} />;
    case 'cancelled':
    case 'contested':
      return <ClosedBonScreen status={data.status} reference={data.reference} />;
    case 'replaced':
      return (
        <InvalidatedLinkScreen
          reason={data.invalidatedReason}
          reference={data.reference}
          followUp={data.followUp}
          documentType={data.documentType}
        />
      );
    case 'expired':
      return (
        <ExpiredLinkScreen token={token} reference={data.reference} newLinkRequestedAt={data.newLinkRequestedAt} />
      );
    case 'already_signed':
      if (!tokenState.signed) {
        return (
          <AlreadySignedScreen
            reference={data.reference}
            bonId={data.bonId}
            downloadError={documents.downloadError}
            onDownloadSigned={documents.handleDownloadSigned}
          />
        );
      }
      break;
    default:
      break;
  }
  if (data.status !== 'pending') return <Loading />;
  if (contested) return <ContestationSentScreen reference={data.bon.reference} />;

  const { bon, signature: sig } = data;
  if (tokenState.signed) {
    return (
      <FreshlySignedScreen
        bon={bon}
        type={sig.type}
        inPerson={sig.isInPerson}
        signedByProxy={tokenState.signedByProxy}
        witnessedByIt={tokenState.witnessedByIt}
        witnessName={currentUser.displayName}
        downloadError={documents.downloadError}
        onDownloadSigned={documents.handleDownloadSigned}
      />
    );
  }

  const isPvCloture = sig.type === 'pv_cloture';
  const isRestitution = sig.type === 'restitution';
  const sigType = signatureTypeLabel(sig.type);
  const emailMismatch = hasEmailMismatch(currentUser, data);
  // Contester : restitution et PV, par le titulaire lui-même (au guichet, le
  // collaborateur le dit au technicien ; la remise se conteste une fois reçue).
  const canContest = (isRestitution || isPvCloture) && !sig.isInPerson && currentUser.id === bon.collaborateurId;

  return (
    // Marges latérales réduites sur téléphone : chaque pixel de largeur
    // profite à la zone de signature.
    <div className="min-h-screen bg-background py-4 px-3 sm:py-8 sm:px-4">
      <div className="mx-auto max-w-2xl space-y-4 sm:space-y-5">
        <BonSummary bon={bon} isPvCloture={isPvCloture} isRestitution={isRestitution} sigType={sigType} />

        <SignatureFormCard
          currentUser={currentUser}
          emailMismatch={emailMismatch}
          bonCollaborateurEmail={bon.collaborateurEmail}
          isPvCloture={isPvCloture}
          isInPerson={sig.isInPerson}
          sigType={sigType}
          tokenExpiresAt={sig.tokenExpiresAt}
          previewError={documents.previewError}
          onPreview={documents.handlePreview}
          canvasRef={canvas.canvasRef}
          isEmpty={canvas.isEmpty}
          clearCanvas={canvas.clear}
          onMouseDown={canvas.onMouseDown}
          onMouseMove={canvas.onMouseMove}
          onMouseUp={canvas.onMouseUp}
          onMouseLeave={canvas.onMouseLeave}
          luApprouve={luApprouve}
          onLuApprouveChange={setLuApprouve}
          submitError={tokenState.submitError}
          submitting={tokenState.submitting}
          disabled={tokenState.submitting || canvas.isEmpty || !luApprouve || emailMismatch}
          onSubmit={() => tokenState.submit(canvas.getDataUrl(), luApprouve)}
          onContest={canContest ? () => setContesting(true) : undefined}
        />

        <p className="text-center text-xs text-muted-foreground pb-4">
          Groupe Livio — Équipe informatique · Signature électronique sécurisée
        </p>
      </div>

      {canContest && (
        <ContestationDialog
          bonId={bon.id}
          bonRef={bon.reference}
          document={sig.type}
          open={contesting}
          onOpenChange={setContesting}
          onSuccess={() => setContested(true)}
        />
      )}
    </div>
  );
}
