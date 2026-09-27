import { useEffect, useRef, useState, useCallback } from 'react';
import { bitmapSizeFor, refitStrokes, type Size, type Stroke } from './signature-geometry';

// Épaisseur fine pour l'affichage écran, épaisse pour l'export PDF
const SCREEN_LINE_WIDTH = 3;
const EXPORT_LINE_WIDTH = 6;
const EXPORT_STROKE_COLOR = '#000000';

interface SignatureCanvasReturn {
  /** Callback ref — attach with `ref={canvasRef}`. */
  canvasRef: (node: HTMLCanvasElement | null) => void;
  isEmpty: boolean;
  clear: () => void;
  getDataUrl: () => string | null;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
}

interface SignatureCanvasOptions {
  /** Le canevas prend les proportions de son cadre à l'écran (plein écran d'un
   *  téléphone en portrait) au lieu d'être étiré ; l'image exportée garde la
   *  taille donnée au canevas dans le JSX, les traits y sont reportés. */
  followFrame?: boolean;
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: ReadonlyArray<Stroke>): void {
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
}

function screenStyle(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.lineWidth = SCREEN_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('color') || '#1e293b';
}

/** Efface le canevas et y redessine les traits, en style écran. */
function redraw(canvas: HTMLCanvasElement, strokes: ReadonlyArray<Stroke>): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  screenStyle(ctx, canvas);
  drawStrokes(ctx, strokes);
}

/** Position et taille du canevas à l'écran, pour savoir si la mise en page a
 *  bougé pendant un trait. */
function rectKey(canvas: HTMLCanvasElement): string {
  const r = canvas.getBoundingClientRect();
  return `${r.left},${r.top},${r.width},${r.height}`;
}

export function useSignatureCanvas({ followFrame = false }: SignatureCanvasOptions = {}): SignatureCanvasReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The canvas often mounts AFTER the first render (loading/auth early-returns,
  // dialogs): track the mounted node in state so the touch-listener effect
  // re-runs when it actually appears — a one-shot effect with an empty deps
  // array used to never attach the listeners, breaking touch signing entirely.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  // Taille de l'image exportée : celle du canevas à son montage.
  const exportSize = useRef<Size | null>(null);
  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (node && !exportSize.current) exportSize.current = { width: node.width, height: node.height };
    setCanvasEl(node);
  }, []);
  const isDrawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const strokes = useRef<Stroke[]>([]);
  const currentStroke = useRef<Array<{ x: number; y: number }>>([]);
  // Mise en page du canevas au dernier point tracé.
  const strokeRect = useRef('');

  // Geste interrompu par le navigateur (rotation de l'écran, geste système)
  // alors que le doigt reste posé : le tracé reprend au mouvement suivant.
  const resumeOnMove = useRef(false);

  const getPos = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const finishStroke = () => {
    if (isDrawing.current && currentStroke.current.length > 0) {
      strokes.current.push([...currentStroke.current]);
      currentStroke.current = [];
    }
    isDrawing.current = false;
  };

  // Mouse events (React synthetic)
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(canvas, e.clientX, e.clientY);
    currentStroke.current = [pos];
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    screenStyle(ctx, canvas);
    const pos = getPos(canvas, e.clientX, e.clientY);
    currentStroke.current.push(pos);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setIsEmpty(false);
  };

  const onMouseUp = () => { finishStroke(); };
  const onMouseLeave = () => { finishStroke(); };

  // Touch events (addEventListener required for passive:false) — re-attached
  // whenever the canvas node (re)mounts
  useEffect(() => {
    const canvas = canvasEl;
    if (!canvas) return;

    const startStroke = (clientX: number, clientY: number) => {
      isDrawing.current = true;
      const ctx = canvas.getContext('2d')!;
      const pos = getPos(canvas, clientX, clientY);
      currentStroke.current = [pos];
      strokeRect.current = rectKey(canvas);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const touchStart = (e: TouchEvent) => {
      resumeOnMove.current = false;
      // Un deuxième doigt qui se pose (déjà en train de signer, ou pincer/
      // zoomer) ne doit pas réinitialiser currentStroke sans finaliser le
      // trait en cours — on ignore l'évènement, le premier doigt continue.
      if (e.touches.length > 1) return;
      e.preventDefault();
      startStroke(e.touches[0].clientX, e.touches[0].clientY);
    };

    const touchMove = (e: TouchEvent) => {
      if (!isDrawing.current && resumeOnMove.current && e.touches.length === 1) {
        // Reprise après une interruption : nouveau trait là où est le doigt.
        e.preventDefault();
        resumeOnMove.current = false;
        startStroke(e.touches[0].clientX, e.touches[0].clientY);
        return;
      }
      if (!isDrawing.current) return;
      // Un deuxième doigt = pincer/zoomer, pas signer : ignorer pour ne pas
      // tracer un trait erratique pendant un geste de zoom.
      if (e.touches.length > 1) return;
      e.preventDefault();
      if (rectKey(canvas) !== strokeRect.current) {
        // Le cadre a bougé ou changé de taille pendant le geste (rotation,
        // plein écran) : relier le point précédent à celui-ci tracerait une
        // ligne parasite. Le trait en cours s'arrête, un autre part du doigt.
        finishStroke();
        startStroke(e.touches[0].clientX, e.touches[0].clientY);
        return;
      }
      const ctx = canvas.getContext('2d')!;
      screenStyle(ctx, canvas);
      const pos = getPos(canvas, e.touches[0].clientX, e.touches[0].clientY);
      currentStroke.current.push(pos);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      setIsEmpty(false);
    };

    // `e.touches` = doigts encore posés APRÈS cet évènement : ne finaliser
    // que lorsque le dernier doigt est levé (touches.length === 0), sinon le
    // premier doigt continue de signer pendant qu'un second est relevé.
    const touchEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      resumeOnMove.current = false;
      finishStroke();
    };
    // Le navigateur annule le geste tactile en cours (appel entrant, geste
    // système, etc.) : sans ce handler le trait en cours restait "ouvert"
    // (isDrawing bloqué à true) sans jamais être poussé dans strokes.
    // Le doigt peut rester posé (rotation de l'écran) : le tracé reprendra au
    // prochain mouvement au lieu d'être perdu.
    const touchCancel = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      if (isDrawing.current) resumeOnMove.current = true;
      finishStroke();
    };
    canvas.addEventListener('touchstart', touchStart, { passive: false });
    canvas.addEventListener('touchmove', touchMove, { passive: false });
    canvas.addEventListener('touchend', touchEnd);
    canvas.addEventListener('touchcancel', touchCancel);

    return () => {
      canvas.removeEventListener('touchstart', touchStart);
      canvas.removeEventListener('touchmove', touchMove);
      canvas.removeEventListener('touchend', touchEnd);
      canvas.removeEventListener('touchcancel', touchCancel);
    };
  }, [canvasEl]);

  // Canevas aux proportions de son cadre : à chaque changement de taille, les
  // traits déjà faits sont reportés puis redessinés dans le nouveau canevas.
  useEffect(() => {
    const canvas = canvasEl;
    const reference = exportSize.current;
    if (!followFrame || !canvas || !reference || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const next = bitmapSizeFor(entry.contentRect, reference);
      if (!next || (next.width === canvas.width && next.height === canvas.height)) return;
      // Un trait en cours s'arrête ici : il reprendra au prochain mouvement,
      // sans être relié à l'ancien repère.
      if (isDrawing.current) {
        finishStroke();
        resumeOnMove.current = true;
      }
      strokes.current = refitStrokes(strokes.current, { width: canvas.width, height: canvas.height }, next);
      canvas.width = next.width;
      canvas.height = next.height;
      redraw(canvas, strokes.current);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasEl, followFrame]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    strokes.current = [];
    currentStroke.current = [];
    setIsEmpty(true);
  }, []);

  // Exporte un PNG avec des traits épais noirs (optimisé pour le rendu PDF),
  // toujours à la taille de référence : les traits d'un canevas plein écran
  // aux autres proportions y sont reportés sans déformation.
  const getDataUrl = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return null;
    const size = exportSize.current ?? { width: canvas.width, height: canvas.height };
    const offscreen = document.createElement('canvas');
    offscreen.width = size.width;
    offscreen.height = size.height;
    const ctx = offscreen.getContext('2d')!;
    ctx.lineWidth = EXPORT_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = EXPORT_STROKE_COLOR;
    drawStrokes(ctx, refitStrokes(strokes.current, { width: canvas.width, height: canvas.height }, size));
    return offscreen.toDataURL('image/png');
  }, [isEmpty]);

  return { canvasRef: attachCanvas, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave };
}
