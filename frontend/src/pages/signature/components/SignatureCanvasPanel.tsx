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

/** Résolution de référence du canevas : l'image exportée a toujours cette taille. */
export const SIGNATURE_CANVAS_WIDTH = 600;
export const SIGNATURE_CANVAS_HEIGHT = 300;

const LABEL_ID = 'signature-canvas-label';

/** Cadre du tracé. Dans la page : proportions 2:1 de l'image exportée, largeur
 *  plafonnée à 120 % de la hauteur de l'écran, pour qu'un téléphone en paysage
 *  garde la zone entière à l'écran.
 *  En plein écran : tout l'espace laissé par les commandes, dans le sens de
 *  l'écran, quelle que soit l'orientation. Le canevas prend alors les
 *  proportions du cadre (voir `useSignatureCanvas({ followFrame })`) : le tracé
 *  n'est ni étiré ni tourné, et il est reporté tel quel dans l'image exportée. */
const FRAME_INLINE = 'w-full aspect-[2/1] max-w-[120vh] [@supports(height:1svh)]:max-w-[120svh]';
const FRAME_EXPANDED = 'h-full w-full';

/** Plein écran : grille à zones nommées. Debout : en-tête, cadre, suggestion
 *  de tourner, « Terminer » ; couché : le cadre à gauche, les commandes dans
 *  une colonne à droite, pour donner toute la hauteur au tracé. */
const EXPANDED_LAYOUT =
  "!m-0 fixed inset-0 z-50 outline-none grid gap-2 bg-background px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] overscroll-contain grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'head'_'pad'_'hint'_'done'] landscape:grid-cols-[minmax(0,1fr)_8.5rem] landscape:grid-rows-[auto_minmax(0,1fr)_auto] landscape:[grid-template-areas:'pad_head'_'pad_hint'_'pad_done'] landscape:pl-[max(0.75rem,env(safe-area-inset-left))] landscape:pr-[max(0.75rem,env(safe-area-inset-right))]";

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
 *  Le canevas suit les proportions de son cadre (le hook de tracé doit être
 *  créé avec `followFrame`) : le tracé n'est jamais étiré, déformé ni tourné,
 *  dans la page comme dans l'image envoyée au PDF ; une rotation ou le retour
 *  au formulaire ne fait que le reporter, réduit s'il le faut.
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
        expanded && EXPANDED_LAYOUT,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 mb-1',
          expanded && '[grid-area:head] landscape:mb-0 landscape:flex-col landscape:items-stretch',
        )}
      >
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
      <div
        className={cn(
          expanded && '[grid-area:pad] flex min-h-0 items-center justify-center overflow-hidden',
        )}
      >
        <div
          ref={frameRef}
          className={cn(
            'relative mx-auto border-2 border-dashed border-border rounded-lg bg-muted/30 hover:border-primary/50 transition-colors touch-none select-none overscroll-contain',
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
          {/* Simple suggestion : la zone est déjà dans le bon sens en portrait. */}
          <p className="[grid-area:hint] hidden items-center justify-center gap-2 text-center text-sm text-muted-foreground portrait:flex">
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" /> Pour plus de place, vous pouvez tourner le téléphone.
          </p>
          {/* En bas, sous le pouce. */}
          <button
            type="button"
            onClick={close}
            className="[grid-area:done] landscape:self-end btn-gradient w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-primary-foreground"
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
