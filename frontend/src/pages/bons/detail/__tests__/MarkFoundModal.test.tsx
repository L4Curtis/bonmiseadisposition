import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkFoundModal } from '../MarkFoundModal';
import { equipment } from './fixtures';

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

const equipments = [
  equipment({ id: 'e1', customLabel: 'Souris sans fil', serialNumber: 'SN-1', order: 0, notReturned: true, notReturnedReason: 'Perdu', returnState: 'not_returned' }),
  equipment({ id: 'e2', customLabel: 'Clavier', serialNumber: 'SN-2', order: 1, notReturned: true, returnState: 'not_returned' }),
  equipment({ id: 'e3', customLabel: 'Écran', serialNumber: 'SN-3', order: 2 }),
];

function sign() {
  const canvas = screen.getByLabelText(/zone de signature/i);
  fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(canvas, { clientX: 30, clientY: 30 });
  fireEvent.mouseUp(canvas);
}

describe('MarkFoundModal', () => {
  it('ne propose que les équipements déclarés non rendus', () => {
    render(<MarkFoundModal equipments={equipments} onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('refuse la soumission sans sélection', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<MarkFoundModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    await user.click(screen.getByRole('button', { name: /Marquer retrouvé/i }));

    expect(await screen.findByText('Sélectionnez au moins un équipement retrouvé.')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('bon clôturé : la signature IT de l’avenant est obligatoire', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<MarkFoundModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} isArchived />);

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Générer l'avenant/i }));

    expect(await screen.findByText(/signature IT est obligatoire/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('bon clôturé : sélection multiple + signature, un seul appel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<MarkFoundModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} isArchived />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    sign();
    await user.click(screen.getByRole('button', { name: /Générer l'avenant \(2\)/i }));

    expect(onConfirm).toHaveBeenCalledWith(['e1', 'e2'], 'data:image/png;base64,MOCK');
  });

  it('restitution en cours : pas de signature ici, la restitution suivra le parcours habituel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<MarkFoundModal equipments={equipments} onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);

    expect(screen.queryByLabelText(/zone de signature/i)).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('button', { name: /Marquer retrouvé \(1\)/i }));
    expect(onConfirm).toHaveBeenCalledWith(['e2']);
  });

  it('désactive le bouton de confirmation pendant le chargement', () => {
    render(<MarkFoundModal equipments={equipments} onConfirm={vi.fn()} onCancel={vi.fn()} loading />);
    expect(screen.getByRole('button', { name: /En cours/i })).toBeDisabled();
  });
});
