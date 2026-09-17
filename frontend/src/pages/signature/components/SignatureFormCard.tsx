import { FileText, Loader2, Pen, XCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { User } from '@/types';
import { ConsentChecklist } from './ConsentChecklist';
import { SignatureCanvasPanel } from './SignatureCanvasPanel';

interface SignatureFormCardProps {
  currentUser: User;
  emailMismatch: boolean | null;
  bonCollaborateurEmail: string;
  isPvCloture: boolean;
  isInPerson: boolean | null;
  sigType: string;
  tokenExpiresAt: string;
  previewError: string | null;
  onPreview: () => void;
  canvasRef: (node: HTMLCanvasElement | null) => void;
  isEmpty: boolean;
  clearCanvas: () => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  luApprouve: boolean;
  onLuApprouveChange: (checked: boolean) => void;
  submitError: string | null;
  submitting: boolean;
  disabled: boolean;
  onSubmit: () => void;
}

/** Carte « Votre signature » : rappel du compte connecté, avertissements
 *  éventuels (compte non autorisé, procès-verbal, présentiel), aperçu du
 *  document, canevas de dessin, case de consentement puis bouton de
 *  soumission. */
export function SignatureFormCard({
  currentUser,
  emailMismatch,
  bonCollaborateurEmail,
  isPvCloture,
  isInPerson,
  sigType,
  tokenExpiresAt,
  previewError,
  onPreview,
  canvasRef,
  isEmpty,
  clearCanvas,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  luApprouve,
  onLuApprouveChange,
  submitError,
  submitting,
  disabled,
  onSubmit,
}: SignatureFormCardProps) {
  return (
    <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm text-foreground">Votre signature</h2>
        <span className="text-xs text-muted-foreground/70">
          Connecté en tant que <strong>{currentUser.displayName}</strong> ({currentUser.email})
        </span>
      </div>

      {/* Email mismatch warning */}
      {emailMismatch && (
        <div role="alert" className="mx-5 mt-4 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Compte non autorisé</p>
            <p className="text-xs mt-0.5">
              Ce document est destiné à <strong>{bonCollaborateurEmail}</strong>. Vous êtes connecté avec <strong>{currentUser.email}</strong>. Veuillez vous connecter avec le bon compte Microsoft.
            </p>
          </div>
        </div>
      )}

      {isPvCloture && (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
          <div>
            <p className="font-medium">Procès-verbal d'équipements non restitués</p>
            <p className="text-xs mt-0.5">
              Ce document atteste que les équipements listés ci-dessus n'ont pas été restitués. Votre signature confirme que vous avez pris connaissance de ce procès-verbal.
            </p>
          </div>
        </div>
      )}
      {isInPerson && !isPvCloture && (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 p-3 text-sm text-amber-700 dark:text-amber-400">
          <div>
            <p className="font-medium">Signature présentielle</p>
            <p className="text-xs mt-0.5">
              Cette signature est réalisée en présence du technicien informatique. Signez ci-dessous pour confirmer la {sigType} du matériel.
            </p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Aperçu du document exact qui sera signé */}
        <button
          type="button"
          onClick={onPreview}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted/60 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Voir le document qui sera signé (PDF)
        </button>
        {previewError && (
          <p className="text-xs text-red-600 dark:text-red-400 text-center">{previewError}</p>
        )}

        <SignatureCanvasPanel
          canvasRef={canvasRef}
          isEmpty={isEmpty}
          clear={clearCanvas}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />

        <ConsentChecklist
          isPvCloture={isPvCloture}
          sigType={sigType}
          luApprouve={luApprouve}
          onChange={onLuApprouveChange}
        />

        {/* Error */}
        {submitError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={onSubmit}
          disabled={disabled}
          className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99] ${isPvCloture ? 'bg-red-700 hover:bg-red-800 shadow-sm' : 'btn-gradient'}`}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Signature en cours…</>
          ) : isPvCloture ? (
            <><Pen className="h-4 w-4" /> Signer le procès-verbal</>
          ) : (
            <><Pen className="h-4 w-4" /> Signer le bon de {sigType}</>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground/70">
          Lien valide jusqu'au {formatDateTime(tokenExpiresAt)}
        </p>
      </div>
    </div>
  );
}
