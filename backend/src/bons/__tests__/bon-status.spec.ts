import { BonStatus } from '@prisma/client';
import {
  BON_STATUS_LABELS,
  BON_STATUS_ORDER,
  CANCELLABLE_BON_STATUSES,
  CLOSED_BON_STATUSES,
  COLLAB_HIDDEN_BON_STATUSES,
  FOUND_EQUIPMENT_BON_STATUSES,
  IN_PROGRESS_BON_STATUSES,
  LOANED_BON_STATUSES,
  NON_SIGNABLE_BON_STATUSES,
  RESTITUTION_PHASE_BON_STATUSES,
  RESTITUTION_START_BON_STATUSES,
  SIGNATURE_LINK_BON_STATUSES,
  TO_SIGN_BON_STATUSES,
  bonStatusLabel,
  isBonStatusIn,
} from '../bon-status';

const ALL_STATUSES = Object.values(BonStatus);

describe('bon-status — ordre et libellés', () => {
  it('BON_STATUS_ORDER cite chaque statut de la base une seule fois, dans l’ordre du cycle de vie', () => {
    expect(BON_STATUS_ORDER).toEqual([
      'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested', 'archived', 'cancelled',
    ]);
    expect([...BON_STATUS_ORDER].sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('les libellés suivent le vocabulaire retenu par le propriétaire', () => {
    expect(BON_STATUS_LABELS).toEqual({
      draft: 'Brouillon',
      sent_mise_dispo: 'Remise à signer',
      active: 'En cours',
      sent_restitution: 'Restitution à signer',
      partially_returned: 'Restitution en cours',
      archived: 'Clôturé',
      cancelled: 'Annulé',
      contested: 'Contesté',
    });
  });

  it('bonStatusLabel traduit un statut connu', () => {
    expect(bonStatusLabel('archived')).toBe('Clôturé');
    expect(bonStatusLabel('active')).toBe('En cours');
  });

  it.each(['statut_futur', 'constructor', 'toString', '__proto__', ''])(
    'bonStatusLabel renvoie la valeur brute d’un statut inconnu (%s)',
    (value) => {
      expect(bonStatusLabel(value)).toBe(value);
    },
  );
});

describe('bon-status — listes de statuts', () => {
  it('« clôturé ou annulé » et « en cours de traitement » se partagent tous les statuts', () => {
    expect(CLOSED_BON_STATUSES).toEqual(['archived', 'cancelled']);
    expect(IN_PROGRESS_BON_STATUSES).toEqual([
      'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
    ]);
    expect(IN_PROGRESS_BON_STATUSES.filter((s) => CLOSED_BON_STATUSES.includes(s))).toEqual([]);
    expect([...IN_PROGRESS_BON_STATUSES, ...CLOSED_BON_STATUSES].sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('« à signer » : le bon entier attend la signature du collaborateur', () => {
    expect(TO_SIGN_BON_STATUSES).toEqual(['sent_mise_dispo', 'sent_restitution']);
  });

  it('un lien de signature peut aussi attendre pendant une restitution en cours', () => {
    expect(SIGNATURE_LINK_BON_STATUSES).toEqual(['sent_mise_dispo', 'sent_restitution', 'partially_returned']);
  });

  it('listes des actions du cycle de vie', () => {
    expect(CANCELLABLE_BON_STATUSES).toEqual(['draft', 'sent_mise_dispo']);
    expect(LOANED_BON_STATUSES).toEqual(['active', 'sent_restitution', 'partially_returned']);
    expect(RESTITUTION_START_BON_STATUSES).toEqual(['active', 'partially_returned']);
    expect(RESTITUTION_PHASE_BON_STATUSES).toEqual(['sent_restitution', 'partially_returned']);
    expect(FOUND_EQUIPMENT_BON_STATUSES).toEqual(['partially_returned', 'archived']);
    expect(NON_SIGNABLE_BON_STATUSES).toEqual(['archived', 'cancelled', 'contested']);
    expect(COLLAB_HIDDEN_BON_STATUSES).toEqual(['draft', 'cancelled']);
  });

  it('les listes sont figées : aucun appelant ne peut les modifier', () => {
    const lists = [
      BON_STATUS_ORDER, CLOSED_BON_STATUSES, IN_PROGRESS_BON_STATUSES, TO_SIGN_BON_STATUSES,
      SIGNATURE_LINK_BON_STATUSES, CANCELLABLE_BON_STATUSES, LOANED_BON_STATUSES,
      RESTITUTION_START_BON_STATUSES, RESTITUTION_PHASE_BON_STATUSES, FOUND_EQUIPMENT_BON_STATUSES,
      NON_SIGNABLE_BON_STATUSES, COLLAB_HIDDEN_BON_STATUSES, BON_STATUS_LABELS,
    ];
    for (const list of lists) expect(Object.isFrozen(list)).toBe(true);
  });

  it('isBonStatusIn accepte un statut typé comme simple texte', () => {
    const status: string = 'contested';
    expect(isBonStatusIn(status, NON_SIGNABLE_BON_STATUSES)).toBe(true);
    expect(isBonStatusIn(status, CANCELLABLE_BON_STATUSES)).toBe(false);
    expect(isBonStatusIn('inconnu', IN_PROGRESS_BON_STATUSES)).toBe(false);
  });
});
