import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EquipmentSection } from '../EquipmentSection';
import { duplicateLine } from '../lib/equipmentLines';
import { newLine } from '../types';
import type { EquipmentLine, SerialConflict } from '../types';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), getBlob: vi.fn(), postForm: vi.fn(), patchForm: vi.fn() },
}));

function renderSection(overrides: Partial<React.ComponentProps<typeof EquipmentSection>> = {}) {
  const equipments: EquipmentLine[] = overrides.equipments ?? [
    newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420', serialNumber: 'SN-1' }),
  ];
  const props: React.ComponentProps<typeof EquipmentSection> = {
    equipments,
    allCatalogItems: [],
    packs: [],
    duplicateSerialIds: new Set<string>(),
    liveSerialConflicts: new Map<string, SerialConflict[]>(),
    onAddFromCatalog: vi.fn(),
    onAddFromPack: vi.fn(),
    onAddEmptyLine: vi.fn(),
    onRemoveEquipment: vi.fn(),
    onUpdateEquipment: vi.fn(),
    onDuplicateEquipment: vi.fn(),
    onPasteSerial: vi.fn(),
    onSerialBlur: vi.fn(),
    onImportDuplicatedEquipments: vi.fn(),
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

// C4 — lecteur de code-barres : Entrée dans le champ N° Série valide la ligne
// et enchaîne sur la suivante, sans jamais soumettre le formulaire englobant
// (même piège que F1-1 pour les boutons sans type="button" — voir BonCreate.test.tsx).
function EquipmentSectionStateful({ initial }: { readonly initial: EquipmentLine[] }) {
  const [equipments, setEquipments] = useState(initial);
  return (
    <EquipmentSection
      equipments={equipments}
      allCatalogItems={[]}
      packs={[]}
      duplicateSerialIds={new Set()}
      liveSerialConflicts={new Map()}
      onAddFromCatalog={vi.fn()}
      onAddFromPack={vi.fn()}
      onAddEmptyLine={vi.fn()}
      onRemoveEquipment={vi.fn()}
      onUpdateEquipment={(id, field, value) =>
        setEquipments((prev) => prev.map((e) => (e._id === id ? { ...e, [field]: value } : e)))
      }
      onDuplicateEquipment={(id) => setEquipments((prev) => duplicateLine(prev, id))}
      onPasteSerial={vi.fn()}
      onSerialBlur={vi.fn()}
      onImportDuplicatedEquipments={vi.fn()}
    />
  );
}

describe('EquipmentSection — lecteur de code-barres (Entrée dans le champ N° Série)', () => {
  it('duplique la ligne, place le curseur dans le N° Série de la nouvelle ligne, et ne soumet jamais le formulaire englobant', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const initial = [newLine({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420' })];

    render(
      <form onSubmit={onSubmit}>
        <EquipmentSectionStateful initial={initial} />
      </form>,
    );

    const firstSerial = screen.getByLabelText('Numéro de série - ligne 1');
    await user.type(firstSerial, 'SN-1000{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    const secondSerial = await screen.findByLabelText('Numéro de série - ligne 2');
    expect(secondSerial).toHaveFocus();
    // Même article recopié sur la nouvelle ligne, numéro de série vide (pas
    // celui qui vient d'être saisi) — voir duplicateLine.
    expect(screen.getAllByText('Dell Latitude 5420')).toHaveLength(2);
    expect(secondSerial).toHaveValue('');
  });

  it('enchaîne plusieurs lignes de suite (dix exemplaires identiques sans lâcher le lecteur)', async () => {
    const user = userEvent.setup();
    const initial = [newLine({ customLabel: 'Casque' })];
    render(<EquipmentSectionStateful initial={initial} />);

    // Premier focus explicite (clic) : les suivants s'enchaînent par le seul
    // clavier, comme un vrai lecteur de code-barres qui ne touche jamais la
    // souris — user.keyboard() tape dans l'élément actuellement focus.
    await user.click(screen.getByLabelText('Numéro de série - ligne 1'));
    for (const serial of ['SN-A', 'SN-B', 'SN-C']) {
      await user.keyboard(`${serial}{Enter}`);
    }

    expect(screen.getAllByPlaceholderText('SN-XXXXX')).toHaveLength(4);
    expect(screen.getAllByPlaceholderText('SN-XXXXX')[3]).toHaveFocus();
  });
});

describe('EquipmentSection — conflit de numéro de série sur un autre bon (en direct, C6)', () => {
  const conflicts: SerialConflict[] = [
    { serialNumber: 'SN-42', bonId: 'b1', bonReference: 'BON-2026-0007', bonStatus: 'active', collaborateur: 'Marie Martin' },
  ];

  it('avertit (non bloquant) quand un conflit est signalé pour cette ligne', () => {
    const equipments = [newLine({ customLabel: 'Souris', serialNumber: 'SN-42' })];
    renderSection({ equipments, liveSerialConflicts: new Map([[equipments[0]._id, conflicts]]) });

    expect(screen.getByLabelText('Numéro de série - ligne 1')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Déjà en circulation sur BON-2026-0007/)).toBeInTheDocument();
  });

  it('ne signale rien sans entrée dans liveSerialConflicts pour cette ligne', () => {
    renderSection();
    expect(screen.getByLabelText('Numéro de série - ligne 1')).not.toHaveAttribute('aria-invalid');
  });

  it('le doublon local (même bon) prime visuellement sur le conflit avec un autre bon', () => {
    const equipments = [
      newLine({ customLabel: 'Souris', serialNumber: 'SN-42' }),
      newLine({ customLabel: 'Clavier', serialNumber: 'SN-42' }),
    ];
    renderSection({
      equipments,
      duplicateSerialIds: new Set([equipments[0]._id, equipments[1]._id]),
      liveSerialConflicts: new Map([[equipments[0]._id, conflicts]]),
    });

    expect(screen.queryByText(/Déjà en circulation sur/)).not.toBeInTheDocument();
  });
});

describe('EquipmentSection — vérification de conflit à la sortie du champ', () => {
  it("appelle onSerialBlur avec l'id de la ligne et la valeur saisie", async () => {
    const user = userEvent.setup();
    const { props } = renderSection();
    const input = screen.getByLabelText('Numéro de série - ligne 1');
    await user.click(input);
    await user.tab();
    expect(props.onSerialBlur).toHaveBeenCalledWith(props.equipments[0]._id, 'SN-1');
  });
});
