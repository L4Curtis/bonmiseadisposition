import { describe, it, expect, vi, beforeEach } from 'vitest';
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
