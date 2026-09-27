import { useEffect, useRef, type RefObject } from 'react';
import { Check, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBlockZoomGestures, useSignatureFullscreen } from '../hooks/useSignatureFullscreen';

interface SignatureCanvasPanelProps {
  canvasRef: (node: HTMLCanvasElement | null) => void;
  isEmpty: boolean;
  clear: () => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  /** Envoi en cours : le tracé est déjà capturé, « Effacer » n'a plus d'effet utile. */
  disabled?: boolean;
}

/** Résolution interne du canevas : l'export PNG garde toujours ces proportions. */
export const SIGNATURE_CANVAS_WIDTH = 600;
export const SIGNATURE_CANVAS_HEIGHT = 300;

const LABEL_ID = 'signature-canvas-label';

/** Cadre du tracé. Dans la page : largeur plafonnée à 120 % de la hauteur de
 *  l'écran, pour qu'un téléphone en paysage garde la zone entière à l'écran.
 *  En plein écran : la plus grande zone 2:1 qui tient dans l'espace laissé
 *  entre l'en-tête et « Terminer » (unités de conteneur : 100 % de la largeur
 *  ou deux fois la hauteur disponible, la plus petite des deux). */
const FRAME_INLINE = 'max-w-[120vh] [@supports(height:1svh)]:max-w-[120svh]';
const FRAME_EXPANDED = 'w-[min(100cqw,200cqh)]';

/** Le focus entre dans le panneau à l'ouverture (clavier, lecteur d'écran) et
 *  revient sur « Agrandir » à la fermeture, au lieu de retomber en haut de
 *  la page. */
function useFocusOnToggle(
  expanded: boolean,
  panelRef: RefObject<HTMLElement | null>,
  expandButtonRef: RefObject<HTMLElement | null>,
): void {
  const wasExpanded = useRef(false);
  useEffect(() => {
    if (expanded) panelRef.current?.focus();
    else if (wasExpanded.current) expandButtonRef.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded, panelRef, expandButtonRef]);
}

/** Zone de dessin de la signature : canevas, « Effacer », et « Agrandir »
 *  pour signer en plein écran sur téléphone.
 *
 *  Le cadre garde en permanence les proportions de la résolution interne
 *  (2:1) : le tracé n'est jamais étiré ni déformé dans l'image envoyée au
 *  PDF, et une rotation ne fait qu'agrandir ou réduire ce qui est dessiné.
 *
 *  Le plein écran ne change que la mise en page : l'arbre des éléments reste
 *  le même, le canevas n'est donc jamais recréé et le tracé est conservé à
 *  l'aller comme au retour. */
export function SignatureCanvasPanel({
  canvasRef,
  isEmpty,
  clear,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  disabled = false,
}: SignatureCanvasPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const { expanded, open, close } = useSignatureFullscreen(rootRef);
  // Zoom bloqué sur la zone de tracé seulement : ailleurs sur la page, une
  // personne malvoyante doit pouvoir zoomer. En plein écran, le panneau entier.
  useBlockZoomGestures(expanded ? rootRef : frameRef);
  useFocusOnToggle(expanded, rootRef, expandButtonRef);

  return (
    <div
      ref={rootRef}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? 'Signature en plein écran' : undefined}
      tabIndex={expanded ? -1 : undefined}
      className={cn(
        // `!m-0` : le parent espace ses enfants par une marge haute
        // (`space-y-*`), qui décalerait le panneau plein écran vers le bas.
        expanded &&
          '!m-0 fixed inset-0 z-50 outline-none flex flex-col gap-2 bg-background px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] overscroll-contain',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span id={LABEL_ID} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {expanded ? 'Signez dans le cadre' : 'Tracez votre signature ci-dessous'}
        </span>
        {/* Zone de toucher de 44 px minimum : le bouton visuellement discret
            reste facile à atteindre au doigt. */}
        <button
          type="button"
          onClick={clear}
          disabled={disabled || isEmpty}
          className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Effacer
        </button>
      </div>
      <div className={cn(expanded && 'flex min-h-0 flex-1 items-center justify-center [container-type:size]')}>
        <div
          ref={frameRef}
          className={cn(
            'relative mx-auto w-full aspect-[2/1] border-2 border-dashed border-border rounded-lg bg-muted/30 hover:border-primary/50 transition-colors touch-none select-none overscroll-contain',
            expanded ? FRAME_EXPANDED : FRAME_INLINE,
          )}
        >
          <canvas
            ref={canvasRef}
            width={SIGNATURE_CANVAS_WIDTH}
            height={SIGNATURE_CANVAS_HEIGHT}
            aria-labelledby={LABEL_ID}
            className="w-full h-full cursor-crosshair block text-foreground"
            style={{ touchAction: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          />
          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground/70 text-base select-none">Signez ici avec le doigt ou la souris</p>
            </div>
          )}
        </div>
      </div>
      {expanded ? (
        <>
          <p className="hidden items-center justify-center gap-2 text-center text-sm text-muted-foreground portrait:flex">
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" /> Tournez le téléphone à l'horizontale pour plus de place.
          </p>
          {/* En bas, sous le pouce. */}
          <button
            type="button"
            onClick={close}
            className="btn-gradient w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-primary-foreground"
          >
            <Check className="h-4 w-4" aria-hidden="true" /> Terminer
          </button>
        </>
      ) : (
        // Proposé aux écrans tactiles seulement : à la souris, la zone suffit.
        <button
          ref={expandButtonRef}
          type="button"
          onClick={open}
          disabled={disabled}
          className="mt-2 w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground/80 hover:bg-muted/60 disabled:opacity-50 [@media(pointer:fine)]:hidden"
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" /> Agrandir la zone de signature
        </button>
      )}
    </div>
  );
}
