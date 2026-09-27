import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSignatureCanvas } from '../use-signature-canvas';

// jsdom n'implémente pas CanvasRenderingContext2D : on fournit un contexte
// minimal (juste les méthodes appelées par le hook) pour pouvoir exercer
// isEmpty/clear sans faire tourner un vrai moteur de rendu.
function mockContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getBoundingClientRect;
});

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 300;
  return canvas;
}

describe('useSignatureCanvas — isEmpty / clear', () => {
  it('starts empty, becomes non-empty once a stroke is drawn, and clear() resets it to empty', () => {
    const { result } = renderHook(() => useSignatureCanvas());
    act(() => {
      result.current.canvasRef(makeCanvas());
    });
    expect(result.current.isEmpty).toBe(true);

    act(() => {
      result.current.onMouseDown({ clientX: 10, clientY: 10 } as unknown as React.MouseEvent<HTMLCanvasElement>);
      result.current.onMouseMove({ clientX: 20, clientY: 20 } as unknown as React.MouseEvent<HTMLCanvasElement>);
    });
    expect(result.current.isEmpty).toBe(false);

    act(() => {
      result.current.clear();
    });
    expect(result.current.isEmpty).toBe(true);
  });

  it('does not become non-empty from mouse movement alone (mouseup/leave without a preceding mousedown)', () => {
    const { result } = renderHook(() => useSignatureCanvas());
    act(() => {
      result.current.canvasRef(makeCanvas());
    });

    act(() => {
      result.current.onMouseMove({ clientX: 20, clientY: 20 } as unknown as React.MouseEvent<HTMLCanvasElement>);
      result.current.onMouseUp();
    });

    expect(result.current.isEmpty).toBe(true);
  });
});

/** Évènement tactile minimal : `touches` = doigts encore posés. */
function touch(type: string, points: Array<{ clientX: number; clientY: number }>): TouchEvent {
  const event = new Event(type, { cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: points });
  return event;
}

function lastMoveTo(ctx: CanvasRenderingContext2D): unknown[] | undefined {
  return vi.mocked(ctx.moveTo).mock.calls.at(-1);
}

describe('useSignatureCanvas — rotation du téléphone et interruption du geste (CM n° 5)', () => {
  let ctx: CanvasRenderingContext2D;
  beforeEach(() => {
    ctx = mockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('geste annulé par le navigateur, doigt posé : le tracé reprend au mouvement suivant, sans relier les deux traits', () => {
    const { result } = renderHook(() => useSignatureCanvas());
    const canvas = makeCanvas();
    act(() => result.current.canvasRef(canvas));

    act(() => {
      canvas.dispatchEvent(touch('touchstart', [{ clientX: 10, clientY: 10 }]));
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 20, clientY: 20 }]));
      // Le navigateur annule le geste en tournant l'écran, le doigt reste posé.
      canvas.dispatchEvent(touch('touchcancel', []));
    });
    vi.mocked(ctx.lineTo).mockClear();
    act(() => {
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 40, clientY: 40 }]));
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 50, clientY: 50 }]));
    });
    // Nouveau trait commencé là où est le doigt, puis prolongé : rien n'est perdu.
    expect(lastMoveTo(ctx)).toEqual([40, 40]);
    expect(ctx.lineTo).not.toHaveBeenCalledWith(40, 40);
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 50);
  });

  it('cadre déplacé ou redimensionné pendant le geste : pas de trait parasite entre avant et après', () => {
    const { result } = renderHook(() => useSignatureCanvas());
    const canvas = makeCanvas();
    let rect = { left: 0, top: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON: () => ({}) };
    canvas.getBoundingClientRect = () => rect as DOMRect;
    act(() => result.current.canvasRef(canvas));

    act(() => {
      canvas.dispatchEvent(touch('touchstart', [{ clientX: 10, clientY: 10 }]));
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 20, clientY: 20 }]));
    });
    // Rotation : le cadre fait maintenant 300 × 150, plus bas dans l'écran.
    rect = { left: 0, top: 100, right: 300, bottom: 250, width: 300, height: 150, x: 0, y: 100, toJSON: () => ({}) };
    vi.mocked(ctx.lineTo).mockClear();
    act(() => {
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 100, clientY: 150 }]));
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 110, clientY: 160 }]));
    });
    expect(lastMoveTo(ctx)).toEqual([200, 100]);
    expect(ctx.lineTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledWith(220, 120);
  });

  it('sans interruption, un mouvement sans doigt posé ne trace rien', () => {
    const { result } = renderHook(() => useSignatureCanvas());
    const canvas = makeCanvas();
    act(() => result.current.canvasRef(canvas));
    act(() => {
      canvas.dispatchEvent(touch('touchstart', [{ clientX: 10, clientY: 10 }]));
      canvas.dispatchEvent(touch('touchend', []));
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 40, clientY: 40 }]));
    });
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });
});

/** ResizeObserver pilotable : le test décide quand le cadre change de taille. */
function installResizeObserver(): (width: number, height: number) => void {
  let notify: ((width: number, height: number) => void) | null = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notify = (width, height) =>
          callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  return (width, height) => act(() => notify?.(width, height));
}

describe('useSignatureCanvas — canevas qui suit son cadre plein écran (followFrame)', () => {
  let ctx: CanvasRenderingContext2D;
  beforeEach(() => {
    ctx = mockContext();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,');
  });
  afterEach(() => vi.unstubAllGlobals());

  function drawInPortrait() {
    const resize = installResizeObserver();
    const { result } = renderHook(() => useSignatureCanvas({ followFrame: true }));
    const canvas = makeCanvas();
    act(() => result.current.canvasRef(canvas));
    // Plein écran d'un téléphone debout : cadre de 360 × 720, deux fois plus haut que large.
    resize(360, 720);
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 360, bottom: 720, width: 360, height: 720, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    // Trait vertical sur toute la hauteur du cadre.
    act(() => {
      canvas.dispatchEvent(touch('touchstart', [{ clientX: 180, clientY: 0 }]));
      canvas.dispatchEvent(touch('touchmove', [{ clientX: 180, clientY: 720 }]));
      canvas.dispatchEvent(touch('touchend', []));
    });
    return { result, canvas, resize };
  }

  it('en portrait, le canevas prend les proportions du cadre : le doigt est suivi sans étirement', () => {
    const { canvas } = drawInPortrait();
    expect([canvas.width, canvas.height]).toEqual([600, 1200]);
    expect(lastMoveTo(ctx)).toEqual([300, 0]);
    expect(ctx.lineTo).toHaveBeenLastCalledWith(300, 1200);
  });

  it('retour au cadre 2:1 : le trait est reporté réduit, droit et entier, dans le canevas de référence', () => {
    const { canvas, resize } = drawInPortrait();
    vi.mocked(ctx.lineTo).mockClear();
    resize(360, 180);
    expect([canvas.width, canvas.height]).toEqual([600, 300]);
    const [x1, y1] = lastMoveTo(ctx) as [number, number];
    const [[x2, y2]] = vi.mocked(ctx.lineTo).mock.calls;
    // Toujours vertical (pas de rotation), tient dans le canevas, centré.
    expect(x1).toBeCloseTo(300);
    expect(x2).toBeCloseTo(300);
    expect(y1).toBeGreaterThanOrEqual(0);
    expect(y2).toBeLessThanOrEqual(300);
    expect(y2 - y1).toBeCloseTo(292);
  });

  it('l’image exportée garde la taille de référence (600 × 300), trait droit et non rogné', () => {
    const { result } = drawInPortrait();
    const created: HTMLCanvasElement[] = [];
    const createElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = createElement(tag);
      if (tag === 'canvas') created.push(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement);
    vi.mocked(ctx.lineTo).mockClear();
    expect(result.current.getDataUrl()).not.toBeNull();
    spy.mockRestore();
    expect([created[0].width, created[0].height]).toEqual([600, 300]);
    const [x1, y1] = lastMoveTo(ctx) as [number, number];
    const [[x2, y2]] = vi.mocked(ctx.lineTo).mock.calls;
    expect(x1).toBeCloseTo(300);
    expect(x2).toBeCloseTo(300);
    expect(y1).toBeGreaterThanOrEqual(0);
    expect(y2).toBeLessThanOrEqual(300);
  });

  it('sans followFrame, le canevas garde sa taille (modales IT)', () => {
    const resize = installResizeObserver();
    const { result } = renderHook(() => useSignatureCanvas());
    const canvas = makeCanvas();
    act(() => result.current.canvasRef(canvas));
    resize(360, 720);
    expect([canvas.width, canvas.height]).toEqual([600, 300]);
  });
});
