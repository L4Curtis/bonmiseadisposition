import { Trash2 } from 'lucide-react';

interface SignatureCanvasPanelProps {
  canvasRef: (node: HTMLCanvasElement | null) => void;
  isEmpty: boolean;
  clear: () => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
}

/** Zone de dessin de la signature : canvas + bouton « Effacer ». */
export function SignatureCanvasPanel({
  canvasRef,
  isEmpty,
  clear,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}: SignatureCanvasPanelProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Tracez votre signature ci-dessous
        </label>
        <button
          onClick={clear}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Trash2 className="h-3 w-3" /> Effacer
        </button>
      </div>
      {/* Canvas plus haut sur mobile (ratio 2:1) pour signer au
          doigt confortablement ; ratio d'origine à partir de sm:.
          La résolution interne (width/height) reste fixe — seul
          l'affichage change, sans casser le mapping des coordonnées
          ni l'export (indépendants l'un de l'autre dans getPos). */}
      <div className="relative border-2 border-dashed border-border rounded-lg bg-muted/30 hover:border-primary/50 transition-colors touch-none aspect-[2/1] sm:aspect-[10/3]">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          className="w-full h-full cursor-crosshair block text-foreground"
          style={{ touchAction: 'none' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground/40 text-sm select-none">Signez ici...</p>
          </div>
        )}
      </div>
    </div>
  );
}
