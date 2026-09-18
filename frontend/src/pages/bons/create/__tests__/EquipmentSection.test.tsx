import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EquipmentSection } from '../EquipmentSection';
import { newLine } from '../types';
import type { EquipmentLine } from '../types';

function renderSection(overrides: Partial<React.ComponentProps<typeof EquipmentSection>> = {}) {
  const equipments: EquipmentLine[] = overrides.equipments ?? [
    newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420', serialNumber: 'SN-1' }),
  ];
  const props: React.ComponentProps<typeof EquipmentSection> = {
    equipments,
    allCatalogItems: [],
    packs: [],
    duplicateSerialIds: new Set<string>(),
    onAddFromCatalog: vi.fn(),
    onAddFromPack: vi.fn(),
    onAddEmptyLine: vi.fn(),
    onRemoveEquipment: vi.fn(),
    onUpdateEquipment: vi.fn(),
    onDuplicateEquipment: vi.fn(),
    onPasteSerial: vi.fn(),
    ...overrides,
  };
  return { ...render(<EquipmentSection {...props} />), props };
}

describe('EquipmentSection — duplication de ligne', () => {
  it('le bouton « Dupliquer la ligne » appelle onDuplicateEquipment avec l\'id de la ligne', async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    await user.click(screen.getByRole('button', { name: 'Dupliquer la ligne 1' }));
    expect(props.onDuplicateEquipment).toHaveBeenCalledWith(props.equipments[0]._id);
  });
});

describe('EquipmentSection — collage multi-lignes sur le numéro de série', () => {
  it('un collage multi-lignes déclenche onPasteSerial et empêche le comportement de collage par défaut', async () => {
    const { props } = renderSection();
    const serialInput = screen.getByLabelText('Numéro de série - ligne 1');

    const clipboardData = { getData: () => 'SN-1\nSN-2\nSN-3' };
    const pasteEvent = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), { clipboardData });
    serialInput.dispatchEvent(pasteEvent);

    expect(props.onPasteSerial).toHaveBeenCalledWith(props.equipments[0]._id, 'SN-1\nSN-2\nSN-3');
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it('un collage d\'une seule valeur ne déclenche pas onPasteSerial (laisse le collage natif du champ)', () => {
    const { props } = renderSection();
    const serialInput = screen.getByLabelText('Numéro de série - ligne 1');

    const clipboardData = { getData: () => 'SN-1' };
    const pasteEvent = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), { clipboardData });
    serialInput.dispatchEvent(pasteEvent);

    expect(props.onPasteSerial).not.toHaveBeenCalled();
    expect(pasteEvent.defaultPrevented).toBe(false);
  });
});

describe('EquipmentSection — doublon local de numéro de série', () => {
  it('marque visuellement (aria-invalid + description) la ligne dont le numéro de série est en double', () => {
    const equipments: EquipmentLine[] = [
      newLine({ customLabel: 'Souris', serialNumber: 'SN-123' }),
      newLine({ customLabel: 'Clavier', serialNumber: 'SN-123' }),
    ];
    renderSection({ equipments, duplicateSerialIds: new Set([equipments[0]._id, equipments[1]._id]) });

    const first = screen.getByLabelText('Numéro de série - ligne 1');
    const second = screen.getByLabelText('Numéro de série - ligne 2');
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(second).toHaveAttribute('aria-invalid', 'true');
  });

  it('ne marque rien quand aucun numéro de série n\'est en double', () => {
    renderSection();
    const input = screen.getByLabelText('Numéro de série - ligne 1');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('EquipmentSection — accessibilité des champs', () => {
  it('chaque champ de la ligne porte un aria-label explicite et indexé', () => {
    renderSection();
    expect(screen.getByLabelText('Numéro de série - ligne 1')).toBeInTheDocument();
    expect(screen.getByLabelText("Numéro d'inventaire - ligne 1")).toBeInTheDocument();
    expect(screen.getByLabelText('Notes - ligne 1')).toBeInTheDocument();
  });
});
