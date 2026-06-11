import { useEffect, useRef, useState, useCallback } from 'react';

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

export function useSignatureCanvas(): SignatureCanvasReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The canvas often mounts AFTER the first render (loading/auth early-returns,
  // dialogs): track the mounted node in state so the touch-listener effect
  // re-runs when it actually appears — a one-shot effect with an empty deps
  // array used to never attach the listeners, breaking touch signing entirely.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasEl(node);
  }, []);
  const isDrawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const currentStroke = useRef<Array<{ x: number; y: number }>>([]);

  const getPos = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const screenStyle = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.lineWidth = SCREEN_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('color') || '#1e293b';
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

    const touchStart = (e: TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const ctx = canvas.getContext('2d')!;
      const pos = getPos(canvas, e.touches[0].clientX, e.touches[0].clientY);
      currentStroke.current = [pos];
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const touchMove = (e: TouchEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const ctx = canvas.getContext('2d')!;
      screenStyle(ctx, canvas);
      const pos = getPos(canvas, e.touches[0].clientX, e.touches[0].clientY);
      currentStroke.current.push(pos);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      setIsEmpty(false);
    };

    const touchEnd = () => { finishStroke(); };

    canvas.addEventListener('touchstart', touchStart, { passive: false });
    canvas.addEventListener('touchmove', touchMove, { passive: false });
    canvas.addEventListener('touchend', touchEnd);

    return () => {
      canvas.removeEventListener('touchstart', touchStart);
      canvas.removeEventListener('touchmove', touchMove);
      canvas.removeEventListener('touchend', touchEnd);
    };
  }, [canvasEl]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    strokes.current = [];
    currentStroke.current = [];
    setIsEmpty(true);
  }, []);

  // Exporte un PNG avec des traits épais noirs (optimisé pour le rendu PDF)
  const getDataUrl = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext('2d')!;
    ctx.lineWidth = EXPORT_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = EXPORT_STROKE_COLOR;
    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
    return offscreen.toDataURL('image/png');
  }, [isEmpty]);

  return { canvasRef: attachCanvas, isEmpty, clear, getDataUrl, onMouseDown, onMouseMove, onMouseUp, onMouseLeave };
}
