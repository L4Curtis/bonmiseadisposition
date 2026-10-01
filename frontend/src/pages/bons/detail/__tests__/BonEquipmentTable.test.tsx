import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { BonEquipmentTable, showsEquipmentState } from '../BonEquipmentTable';
import { bonFiche, equipment } from './fixtures';

describe('BonEquipmentTable — colonne « État »', () => {
  it('bon contesté pendant sa restitution : la colonne reste, pour voir ce qui a été marqué rendu', () => {
    const bon = bonFiche({
      status: 'contested',
      equipments: [
        equipment({ id: 'e1', returnedAt: '2026-09-28T09:00:00.000Z', returnState: 'returned_to_sign' }),
        equipment({ id: 'e2' }),
      ],
    });
    expect(showsEquipmentState(bon)).toBe(true);
  });

  it('bon contesté à la remise (rien de rendu) : pas de colonne', () => {
    expect(showsEquipmentState(bonFiche({ status: 'contested' }))).toBe(false);
  });

  it('restitution commencée ou bon clôturé : colonne affichée', () => {
    expect(showsEquipmentState(bonFiche({ status: 'partially_returned' }))).toBe(true);
    expect(showsEquipmentState(bonFiche({ status: 'archived' }))).toBe(true);
    expect(showsEquipmentState(bonFiche({ status: 'active' }))).toBe(false);
  });

  it('bon clôturé « remplacé » : « Repris sur BON-… » avec un lien vers le remplaçant, jamais « Chez le collaborateur »', () => {
    renderWithProviders(
      <BonEquipmentTable
        equipments={[equipment({ id: 'e1', returnState: 'replaced' })]}
        showEquipmentStatus
        replacedBy={{ id: 'b80', reference: 'BON-2026-0080' }}
      />,
    );
    const table = screen.getByRole('table', { name: 'Équipements du bon' });
    expect(within(table).queryByText(/Chez le collaborateur/)).not.toBeInTheDocument();
    const link = within(table).getByRole('link', { name: /Repris sur BON-2026-0080/ });
    expect(link).toHaveAttribute('href', '/bons/b80');
  });
});
