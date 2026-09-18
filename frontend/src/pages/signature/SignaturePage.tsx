import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertOctagon, Ban, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { useSignatureCanvas } from '@/hooks/use-signature-canvas';
import { LoginRequiredScreen, UnauthorizedScreen } from './components/AuthScreens';
import { StatusScreen } from './components/StatusScreen';
import { BonSummary } from './components/BonSummary';
import { SignatureFormCard } from './components/SignatureFormCard';
import { FreshlySignedScreen, AlreadySignedScreen } from './components/SignatureSuccess';
import { useSignatureToken } from './hooks/useSignatureToken';
import { useDocumentActions } from './hooks/useDocumentActions';
import { signatureTypeLabel } from './lib/signatureLabels';

// ─── Main Component ─────────────────────────────────────────────────────────

export function SignaturePage() {
  const { token } = useParams<{ token: string }>();

  const [luApprouve, setLuApprouve] = useState(false);

  const {
    currentUser,
    checkingAuth,
    loading,
    data,
    error,
    signed,
    submitting,
    submitError,
    signerReturnToQuery,
    isItAccount,
    submit,
    handleSSOLogin,
    handleChangeAccount,
  } = useSignatureToken(token);

  const { previewError, downloadError, handlePreview, handleDownloadSigned } = useDocumentActions(token);

  const { canvasRef, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } = useSignatureCanvas();

  const handleSubmit = () => submit(getDataUrl(), luApprouve);

  // ── Rendering ──────────────────────────────────────────────────────────────

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" /><span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  // Pas connecté → afficher le prompt de connexion immédiatement
  if (!currentUser) {
    return <LoginRequiredScreen signerReturnToQuery={signerReturnToQuery} onSSOLogin={handleSSOLogin} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" /><span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  if (error) {
    return <StatusScreen icon={<XCircle className="h-12 w-12 text-destructive" />} title="Lien invalide" message={error} />;
  }

  if (!data) {
    return <StatusScreen icon={<XCircle className="h-12 w-12 text-destructive" />} title="Document introuvable" message="Ce lien de signature n'existe pas." />;
  }

  // Contrat backend (lot B, en cours) : GET /signature/:token renverra
  // { status: 'cancelled' | 'contested', reference } AVANT le test
  // d'expiration ci-dessous — un bon annulé/contesté ne doit jamais tomber
  // dans l'écran générique « lien expiré », même si son token l'est aussi.
  // Ces deux blocs sont donc volontairement placés avant le test 'expired'.
  if (data.status === 'cancelled') {
    return (
      <StatusScreen
        icon={<Ban className="h-12 w-12 text-muted-foreground" />}
        title="Bon annulé"
        message={`Ce bon${data.reference ? ` (réf. ${data.reference})` : ''} a été annulé par le service informatique. Aucune signature n'est attendue.`}
      />
    );
  }

  if (data.status === 'contested') {
    return (
      <StatusScreen
        icon={<AlertOctagon className="h-12 w-12 text-destructive" />}
        title="Bon contesté"
        message={`Ce bon${data.reference ? ` (réf. ${data.reference})` : ''} fait l'objet d'une contestation en cours de traitement par le service informatique. Aucune signature n'est attendue.`}
      />
    );
  }

  if (data.status === 'replaced') {
    return (
      <StatusScreen
        icon={<Clock className="h-12 w-12 text-warning" />}
        title="Lien remplacé"
        message={`Un nouveau lien de signature vous a été envoyé${data.reference ? ` pour le bon ${data.reference}` : ''} (relance ou nouvelle demande) : ce lien-ci n'est plus valable. Ouvrez le dernier email reçu.`}
      />
    );
  }

  if (data.status === 'expired') {
    return (
      <StatusScreen
        icon={<Clock className="h-12 w-12 text-warning" />}
        title="Lien expiré"
        message={`Ce lien de signature${data.reference ? ` (réf. ${data.reference})` : ''} a expiré. Contactez le service informatique pour en recevoir un nouveau.`}
      />
    );
  }

  // Le backend ne renvoie le détail du bon qu'au destinataire du lien
  if (data.status === 'unauthorized') {
    return <UnauthorizedScreen currentUser={currentUser} onChangeAccount={handleChangeAccount} />;
  }

  // Signature fraîchement soumise (data contient encore le payload pending complet)
  if (signed && data.bon && data.signature) {
    // Signature recueillie par un mandataire IT (technicien/admin connecté
    // pour signer en présentiel au nom du collaborateur) : proposer de
    // revenir à la fiche du bon plutôt qu'au portail collaborateur.
    const isProxySigned = !!data.signature.signedByProxy || isItAccount;
    return (
      <FreshlySignedScreen
        bon={data.bon}
        signature={data.signature}
        isProxySigned={isProxySigned}
        downloadError={downloadError}
        onDownloadSigned={handleDownloadSigned}
      />
    );
  }

  // Lien déjà signé précédemment. Payload minimal aujourd'hui (référence
  // seule) ; le lot B doit y ajouter `bonId` pour permettre un vrai
  // téléchargement — tant qu'il est absent, on renvoie vers le portail.
  if (data.status === 'already_signed') {
    return (
      <AlreadySignedScreen
        reference={data.reference}
        bonId={data.bonId}
        downloadError={downloadError}
        onDownloadSigned={handleDownloadSigned}
      />
    );
  }

  if (!data.bon || !data.signature) {
    return <StatusScreen icon={<XCircle className="h-12 w-12 text-destructive" />} title="Document introuvable" message="Ce lien de signature n'existe pas." />;
  }

  const bon = data.bon;
  const sig = data.signature;
  const isPvCloture = sig.type === 'pv_cloture';
  const isRestitution = sig.type === 'restitution';
  const sigType = signatureTypeLabel(sig.type);
  const isInPerson = sig.isInPerson;

  // Email mismatch warning (not blocking for in-person). trim() pour refléter
  // exactement la normalisation backend (toLowerCase().trim()) et ne pas
  // bloquer à tort un destinataire dont l'email importé a un espace parasite.
  // `email` peut être vide depuis l'arrivée des collaborateurs créés à la main :
  // sans adresse des deux côtés, il n'y a pas de discordance à signaler.
  const emailMismatch =
    !!currentUser?.email && !isInPerson && !!bon.collaborateurEmail &&
    currentUser.email.toLowerCase().trim() !== bon.collaborateurEmail.toLowerCase().trim();

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-5">
        <BonSummary bon={bon} isPvCloture={isPvCloture} isRestitution={isRestitution} sigType={sigType} />

        <SignatureFormCard
          currentUser={currentUser}
          emailMismatch={emailMismatch}
          bonCollaborateurEmail={bon.collaborateurEmail}
          isPvCloture={isPvCloture}
          isInPerson={isInPerson}
          sigType={sigType}
          tokenExpiresAt={sig.tokenExpiresAt}
          previewError={previewError}
          onPreview={handlePreview}
          canvasRef={canvasRef}
          isEmpty={isEmpty}
          clearCanvas={clear}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          luApprouve={luApprouve}
          onLuApprouveChange={setLuApprouve}
          submitError={submitError}
          submitting={submitting}
          disabled={submitting || isEmpty || !luApprouve || (!!(!isInPerson && !isPvCloture && emailMismatch))}
          onSubmit={handleSubmit}
        />

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/60 pb-4">
          Groupe Livio — Service informatique · Signature électronique sécurisée
        </p>
      </div>
    </div>
  );
}
