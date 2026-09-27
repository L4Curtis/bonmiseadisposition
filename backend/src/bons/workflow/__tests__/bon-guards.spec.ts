import { BadRequestException, ConflictException } from '@nestjs/common';
import type { BonDetailRow } from '../../bon-view';
import type { FactsBon } from '../bon-facts';
import { assertActionAllowed, requireReason, statusChangedMeanwhile } from '../bon-guards';

const NOW = new Date('2026-09-25T10:00:00Z').getTime();

/**
 * La garde ne lit que les faits du bon (statut, équipements, signatures,
 * destinataire) : la ligne de fiche complète n'apporterait rien de plus.
 */
function row(overrides: Partial<FactsBon>): BonDetailRow {
  const bon: FactsBon = {
    status: 'draft',
    collaborateur: { active: true, email: 'lea.martin@groupe.fr' },
    equipments: [{ returnedAt: null, notReturned: false }],
    signatures: [],
    ...overrides,
  };
  return bon as unknown as BonDetailRow;
}

function refusalOf(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).message;
  }
  throw new Error('la garde aurait dû refuser');
}

describe('garde des actions du cycle de vie', () => {
  it('laisse passer une action permise et renvoie les faits calculés', () => {
    const facts = assertActionAllowed(row({ status: 'draft' }), 'send', NOW);
    expect(facts).toMatchObject({ status: 'draft', equipmentCount: 1, equipmentOut: 1, canSendLink: true });
  });

  it('refuse une action hors de son statut avec le motif affiché à l’écran', () => {
    expect(refusalOf(() => assertActionAllowed(row({ status: 'active' }), 'send', NOW)))
      .toBe('Seul un brouillon peut être envoyé.');
    expect(refusalOf(() => assertActionAllowed(row({ status: 'archived' }), 'cancel', NOW)))
      .toBe('Un bon ne peut plus être annulé une fois la remise signée.');
  });

  it('refuse une action dont la condition propre n’est pas remplie', () => {
    const allReturned = row({
      status: 'partially_returned',
      equipments: [{ returnedAt: null, notReturned: true }],
    });
    expect(refusalOf(() => assertActionAllowed(allReturned, 'undo_return', NOW)))
      .toBe('Aucun équipement marqué rendu n’attend de signature.');
  });

  it('refuse un envoi par email quand le collaborateur ne peut pas recevoir de lien', () => {
    const inactive = row({ collaborateur: { active: false, email: 'lea.martin@groupe.fr' } });
    const message = refusalOf(() => assertActionAllowed(inactive, 'send', NOW));
    expect(message.length).toBeGreaterThan(0);
    // Le guichet, lui, ne passe pas par l'email : il reste possible.
    expect(() => assertActionAllowed(inactive, 'send_in_person', NOW)).not.toThrow();
  });
});

describe('motif obligatoire', () => {
  it('renvoie le motif sans les espaces autour', () => {
    expect(requireReason('   Matériel perdu en déplacement  ', 'd’annulation')).toBe('Matériel perdu en déplacement');
  });

  it('refuse un motif absent ou de moins de 10 caractères, espaces exclus', () => {
    expect(() => requireReason(undefined, 'd’annulation')).toThrow(
      'Le motif d’annulation est obligatoire (10 caractères au moins).',
    );
    expect(() => requireReason('  court    ', 'd’annulation')).toThrow(BadRequestException);
    expect(requireReason('dix lettre', 'd’annulation')).toBe('dix lettre');
  });
});

describe('course perdue contre une autre action', () => {
  it('répond 409 en demandant de recharger la page', () => {
    const error = statusChangedMeanwhile();
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.message).toBe('Le statut du bon a changé entre-temps : rechargez la page.');
  });
});
