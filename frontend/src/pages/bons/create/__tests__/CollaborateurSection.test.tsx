import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CollaborateurSection } from '../CollaborateurSection';

/** Le formulaire du bon entoure la section : Radix y ajoute un <select> caché
 *  dont l'événement « change » est à l'origine de la course. */
function InForm(p: React.ComponentProps<typeof CollaborateurSection>) {
  return <form><CollaborateurSection {...p} /></form>;
}
import type { Filiale } from '@/types';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const FILIALES = [
  { id: 'f-nord', name: 'nord', displayName: 'Bâtir Nord' },
  { id: 'f-sud', name: 'sud', displayName: 'Rénov Sud' },
] as unknown as Filiale[];

function props(overrides: Partial<React.ComponentProps<typeof CollaborateurSection>> = {}) {
  return {
    civilite: 'mme' as const,
    onCiviliteChange: vi.fn(),
    filialeId: '',
    onFilialeIdChange: vi.fn(),
    filiales: FILIALES,
    collaborateur: null,
    onCollaborateurChange: vi.fn(),
    ...overrides,
  };
}

describe('CollaborateurSection — filiale du bon modifié', () => {
  it('bon chargé AVANT la liste des filiales : la filiale n’est jamais effacée, puis s’affiche', () => {
    const onFilialeIdChange = vi.fn();
    // 1) Premier rendu : ni bon ni filiales.
    const { rerender } = render(<InForm {...props({ filiales: [], onFilialeIdChange })} />);
    // 2) Le bon arrive, la liste des filiales pas encore.
    rerender(<InForm {...props({ filiales: [], filialeId: 'f-sud', onFilialeIdChange })} />);
    // 3) La liste arrive.
    rerender(<InForm {...props({ filialeId: 'f-sud', onFilialeIdChange })} />);

    expect(onFilialeIdChange).not.toHaveBeenCalledWith('');
    expect(screen.getByRole('combobox', { name: /filiale/i })).toHaveTextContent('Rénov Sud');
  });

  it('liste déjà chargée : la filiale du bon s’affiche dès l’arrivée du bon', () => {
    const onFilialeIdChange = vi.fn();
    const { rerender } = render(<InForm {...props({ onFilialeIdChange })} />);
    rerender(<InForm {...props({ filialeId: 'f-nord', onFilialeIdChange })} />);
    expect(onFilialeIdChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: /filiale/i })).toHaveTextContent('Bâtir Nord');
  });
});
