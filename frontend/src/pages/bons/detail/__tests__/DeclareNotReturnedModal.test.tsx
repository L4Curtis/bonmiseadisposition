import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeclareNotReturnedModal } from '../DeclareNotReturnedModal';
import type { EquipmentItem } from '../types';

// jsdom n'implémente pas CanvasRenderingContext2D / toDataURL — mêmes stubs
// minimaux que hooks/__tests__/use-signature-canvas.test.ts.
function mockCanvasContext() {
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
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK');
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, right: 560, bottom: 120, width: 560, height: 120, x: 0, y: 0, toJSON: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getBoundingClientRect;
});

const equipments: EquipmentItem[] = [
  { id: 'e1', customLabel: 'Souris sans fil', serialNumber: 'SN-1', order: 0 },
  { id: 'e2', customLabel: 'Clavier', serialNumber: 'SN-2', order: 1 },
];

function sign() {
  const canvas = screen.getByLabelText(/zone de signature/i);
  fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(canvas, { clientX: 30, clientY: 30 });
  fireEvent.mouseUp(canvas);
}

describe('DeclareNotReturnedModal', () => {
  it('refuse la soumission sans équipement sélectionné', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeclareNotReturnedModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    await user.click(screen.getByRole('button', { name: /Certifier et déclarer/i }));

    expect(await screen.findByText('Sélectionnez au moins un équipement.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuse la soumission sans motif renseigné', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeclareNotReturnedModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Certifier et déclarer/i }));

    expect(await screen.findByText('Le motif est obligatoire.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuse la soumission sans signature (cachet IT obligatoire)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeclareNotReturnedModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.type(screen.getByPlaceholderText(/Perte, vol, casse/i), 'Perdu');
    await user.click(screen.getByRole('button', { name: /Certifier et déclarer/i }));

    expect(await screen.findByText(/cachet IT est obligatoire/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('sélection multiple + motif + signature : un seul appel avec les bons arguments', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeclareNotReturnedModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    await user.type(screen.getByPlaceholderText(/Perte, vol, casse/i), 'Casse écran');
    sign();

    await user.click(screen.getByRole('button', { name: /Certifier et déclarer/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(['e1', 'e2'], 'Casse écran', 'data:image/png;base64,MOCK');
  });

  it('désactive le bouton de confirmation pendant le chargement', () => {
    render(<DeclareNotReturnedModal equipments={equipments} onConfirm={vi.fn()} onCancel={vi.fn()} loading />);
    expect(screen.getByRole('button', { name: /En cours/i })).toBeDisabled();
  });
});
