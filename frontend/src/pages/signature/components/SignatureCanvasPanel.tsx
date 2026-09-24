import { Trash2 } from 'lucide-react';

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

/** Zone de dessin de la signature : canvas + bouton « Effacer ».
 *
 *  Le cadre garde en permanence les proportions de la résolution interne
 *  (2:1). Avant, il passait en 10:3 à partir de 640 px de large (téléphone en
 *  paysage, tablette) alors que le canevas restait à 600 × 300 : le tracé
 *  était étiré à l'écran, déformé d'un facteur 1,7 dans l'image exportée vers
 *  le PDF, et changeait d'allure quand on tournait l'appareil. Avec un
 *  rapport fixe, une rotation ne fait qu'agrandir ou réduire le tracé.
 *
 *  Sur un écran bas (téléphone en paysage), la largeur est plafonnée à
 *  120 % de la hauteur de l'écran : la zone tient alors entière à l'écran
 *  (60 % de la hauteur) au lieu de déborder sous la barre du navigateur. */
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
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span id={LABEL_ID} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Tracez votre signature ci-dessous
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
        className="relative mx-auto w-full max-w-[120vh] [@supports(height:1svh)]:max-w-[120svh] aspect-[2/1] border-2 border-dashed border-border rounded-lg bg-muted/30 hover:border-primary/50 transition-colors touch-none select-none overscroll-contain"
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
  );
}
