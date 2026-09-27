import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { requestNewLink, requestNewLinkMessage } from '../lib/request-new-link';

interface RequestNewLinkButtonProps {
  /** Jeton du lien expiré. */
  token: string;
  className?: string;
}

type RequestState =
  | { step: 'idle' }
  | { step: 'sending' }
  | { step: 'done'; message: string }
  | { step: 'error'; message: string };

/** « Demander un nouveau lien » : un seul geste, puis la réponse en clair
 *  (lien renvoyé, ou équipe informatique prévenue). */
export function RequestNewLinkButton({ token, className }: RequestNewLinkButtonProps) {
  const [state, setState] = useState<RequestState>({ step: 'idle' });

  const handleClick = async () => {
    setState({ step: 'sending' });
    try {
      const result = await requestNewLink(token);
      setState({ step: 'done', message: requestNewLinkMessage(result) });
    } catch (e: unknown) {
      setState({ step: 'error', message: errorMessage(e, "La demande n'a pas pu être envoyée. Réessayez plus tard.") });
    }
  };

  if (state.step === 'done') {
    return (
      <p role="status" className={cn('rounded-lg bg-success/10 border border-success/30 p-3 text-sm text-success', className)}>
        {state.message}
      </p>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state.step === 'sending'}
        className="btn-gradient w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {state.step === 'sending' ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Demander un nouveau lien
      </button>
      {state.step === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
