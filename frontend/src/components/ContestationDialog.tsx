import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { LinkSignatureType } from '@/contracts/bons';
import type { CreateContestationResponse } from '@/contracts/contestations';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { contestationSchema, validate, CONTESTATION_MAX_LENGTH } from '@/lib/validation';

interface ContestationDialogProps {
  bonId: string | null;
  bonRef?: string;
  /** Document contesté (remise par défaut) : le serveur vérifie que c'est
   *  bien celui qui est contestable à cet instant. */
  document?: LinkSignatureType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (contestation: CreateContestationResponse) => void;
}

/** Titre de la fenêtre, selon le document contesté. */
export function contestationDialogTitle(document: LinkSignatureType | undefined, bonRef = ''): string {
  if (document === 'restitution') return `Contester la restitution du bon ${bonRef}`.trim();
  if (document === 'pv_cloture') return `Contester le PV de non-restitution du bon ${bonRef}`.trim();
  return `Contester le bon ${bonRef}`.trim();
}

const PLACEHOLDERS: Readonly<Record<LinkSignatureType, string>> = {
  mise_disposition: "Ex. : le chargeur n'était pas dans le carton, le numéro de série est différent…",
  restitution: "Ex. : j'ai aussi rendu la sacoche, qui n'apparaît pas…",
  pv_cloture: "Ex. : l'écran déclaré non restitué a été rendu au guichet le…",
};

/** Téléphone en portrait : en dessous du point de rupture `sm` de la fenêtre,
 *  qui la met alors pleine largeur (classes `max-sm:`). */
const NARROW_QUERY = '(max-width: 639px)';
/** Téléphone couché : plus large, mais l'écran est bas et le clavier en
 *  prend plus de la moitié (même critère que la coque, shell-media.ts). */
const LOW_TOUCH_QUERY = '(pointer: coarse) and (max-height: 500px)';

/** En dessous de cette hauteur visible (téléphone couché, clavier ouvert),
 *  la fenêtre passe en mise en page compacte. */
const COMPACT_MAX_HEIGHT = 420;

function mediaMatches(query: string): boolean {
  return !!window.matchMedia?.(query).matches;
}

/**
 * Sur téléphone, la fenêtre se cale en haut de la zone réellement visible
 * (`visualViewport`, qui rétrécit quand le clavier s'ouvre) et ne dépasse pas
 * sa hauteur : le champ de saisie, placé en haut, n'est jamais caché par le
 * clavier, et le reste défile dans la fenêtre. Le champ en cours de saisie est
 * ramené dans la zone visible à chaque changement de taille. Téléphone couché :
 * même chose, la fenêtre restant centrée en largeur.
 * Sur ordinateur, rien ne change : la fenêtre reste centrée.
 */
interface KeyboardSafeLayout {
  style: CSSProperties | undefined;
  /** Zone visible basse : explication masquée, champ réduit, boutons collés
   *  en bas de la zone visible. */
  compact: boolean;
}

function useKeyboardSafeLayout(open: boolean, field: RefObject<HTMLElement | null>): KeyboardSafeLayout {
  const [area, setArea] = useState<{ top: number; height: number; narrow: boolean } | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const narrow = mediaMatches(NARROW_QUERY);
    if (!open || !viewport || !(narrow || mediaMatches(LOW_TOUCH_QUERY))) return undefined;
    const update = () => {
      setArea({ top: viewport.offsetTop, height: viewport.height, narrow });
      const el = field.current;
      if (el && document.activeElement === el) el.scrollIntoView({ block: 'nearest' });
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      setArea(null);
    };
  }, [open, field]);
  if (!area) return { style: undefined, compact: false };
  const placement = { top: area.top, maxHeight: area.height };
  const style: CSSProperties = area.narrow ? placement : { ...placement, transform: 'translate(-50%, 0)', overflowY: 'auto' };
  return { style, compact: area.height < COMPACT_MAX_HEIGHT };
}

/** Fenêtre de contestation du collaborateur : un motif, envoyé à l'équipe
 *  informatique. Utilisable au doigt : grande zone de saisie jamais cachée par
 *  le clavier, boutons de 44 px. */
export function ContestationDialog({ bonId, bonRef, document, open, onOpenChange, onSuccess }: ContestationDialogProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const layout = useKeyboardSafeLayout(open, fieldRef);

  const handleClose = (v: boolean) => {
    if (!v) {
      setMessage('');
      setError('');
    }
    onOpenChange(v);
  };

  const handleChange = (value: string) => {
    setMessage(value);
    // Le message d'erreur disparaît dès la première lettre (R-056).
    if (error) setError('');
  };

  const handleSubmit = async () => {
    if (!bonId) return;
    const result = validate(contestationSchema, { message: message.trim() });
    if (!result.success) {
      setError(Object.values(result.errors)[0]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const created = await api.post<CreateContestationResponse>(`/bons/${bonId}/contestation`, {
        message: message.trim(),
        ...(document ? { document } : {}),
      });
      handleClose(false);
      onSuccess(created);
    } catch (e: unknown) {
      setError(errorMessage(e, "La contestation n'a pas pu être envoyée."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        style={layout.style}
        data-compact={layout.compact ? 'true' : undefined}
        className={cn(
          'sm:max-w-md max-sm:left-0 max-sm:top-0 max-sm:max-h-dvh max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-b-2xl',
          // Zone visible très basse : marges et espacements resserrés.
          layout.compact && 'gap-2 p-3',
        )}
      >
        <DialogHeader>
          {/* pr-10 : la croix de fermeture (44 px, coin haut droit) ne touche jamais le titre. */}
          <DialogTitle className={cn('flex items-center gap-2 pr-10 text-left', layout.compact && 'text-base')}>
            <AlertOctagon className="h-5 w-5 shrink-0 text-destructive" />
            {contestationDialogTitle(document, bonRef)}
          </DialogTitle>
          <DialogDescription className={layout.compact ? 'sr-only' : 'text-left'}>
            Expliquez ce qui ne va pas. L'équipe informatique est prévenue et vous répond ; vous suivez la réponse dans
            « Mes équipements ».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="contestation-msg" className={cn(layout.compact && 'sr-only')}>
            Motif de contestation
          </Label>
          <textarea
            ref={fieldRef}
            id="contestation-msg"
            className="w-full rounded-lg border bg-background text-foreground px-3 py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={layout.compact ? 2 : 5}
            placeholder={PLACEHOLDERS[document ?? 'mise_disposition']}
            value={message}
            onChange={(e) => handleChange(e.target.value)}
            maxLength={CONTESTATION_MAX_LENGTH}
            disabled={loading}
            aria-invalid={!!error}
            aria-describedby={error ? 'contestation-error' : undefined}
            autoCapitalize="sentences"
            enterKeyHint="enter"
          />
          <p className={cn('text-xs text-muted-foreground text-right', layout.compact && 'sr-only')}>
            {message.length}/{CONTESTATION_MAX_LENGTH}
          </p>
          {error && (
            <p id="contestation-error" role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        {/* Zone visible basse (clavier ouvert, téléphone couché) : les boutons
            restent collés en bas de la fenêtre, qui défile dessous. */}
        <DialogFooter
          className={cn(
            'flex-col-reverse gap-2 sm:flex-row',
            layout.compact && 'sticky bottom-0 -mx-3 -mb-3 flex-row justify-end bg-card px-3 py-2 border-t border-border/70',
          )}
        >
          <Button variant="outline" className="min-h-11" onClick={() => handleClose(false)} disabled={loading}>
            Annuler
          </Button>
          <Button variant="destructive" className="min-h-11" onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
            Envoyer la contestation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
