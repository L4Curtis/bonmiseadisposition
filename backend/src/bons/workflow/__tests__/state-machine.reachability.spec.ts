import type { BonStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { BonActionName } from '../../../contracts/bons';
import {
  actionBlockedReason,
  BonFacts,
  isActionInScope,
  pendingDocument,
  statusAfterReturnChange,
  statusAfterSignature,
  subStatus,
} from '../state-machine';

/**
 * Propriétés de la machine à états, vérifiées sur TOUS les états atteignables
 * d'un bon de 3 équipements (exploration exhaustive) : on joue chaque action
 * de l'IT que la machine propose, et chaque signature du collaborateur
 * qu'elle attend, en modélisant l'effet de l'action comme le font les
 * workflows. Le contesté (module Contestation) est hors du modèle.
 */

interface ModelState {
  readonly status: BonStatus;
  readonly out: number;
  readonly toSign: number;
  readonly signed: number;
  readonly lost: number;
  /** Le collaborateur peut recevoir un lien (compte actif, adresse délivrable). */
  readonly reachable: boolean;
}

const COUNT = 3;
const TERMINAL: readonly BonStatus[] = ['archived', 'cancelled'];

function toFacts(s: ModelState): BonFacts {
  return {
    status: s.status,
    equipmentCount: COUNT,
    equipmentOut: s.out,
    returnedToSign: s.toSign,
    returnedSigned: s.signed,
    notReturned: s.lost,
    canSendLink: s.reachable,
    linkRefusalMessage: s.reachable ? null : 'Compte désactivé',
    hasValidLink: false,
  };
}

const key = (s: ModelState) => JSON.stringify(s);

/** Statut recalculé après un changement d'équipements (bons prêtés seulement). */
function afterReturn(s: ModelState, next: Omit<ModelState, 'status' | 'reachable'>): ModelState {
  const status = statusAfterReturnChange({
    equipmentCount: COUNT, equipmentOut: next.out, returnedToSign: next.toSign, notReturned: next.lost,
  });
  return { ...s, ...next, status };
}

/** Effets possibles d'une action de l'IT (une par nombre d'équipements choisi). */
function itEffects(s: ModelState, action: BonActionName): ModelState[] {
  const range = (max: number) => Array.from({ length: max }, (_, i) => i + 1);
  switch (action) {
    case 'send':
    case 'send_in_person':
      return [{ ...s, status: 'sent_mise_dispo' }];
    case 'cancel':
      return [{ ...s, status: 'cancelled' }];
    case 'handover_without_signature':
      return [{ ...s, status: 'active' }];
    case 'close_without_signature':
      return [{ ...s, status: 'archived' }];
    case 'start_restitution':
    case 'restitution_in_person':
      return range(s.out).map((k) => afterReturn(s, { ...s, out: s.out - k, toSign: s.toSign + k }));
    case 'undo_return':
      return range(s.toSign).map((k) => afterReturn(s, { ...s, out: s.out + k, toSign: s.toSign - k }));
    case 'declare_not_returned':
      return range(s.out).map((k) => afterReturn(s, { ...s, out: s.out - k, lost: s.lost + k }));
    case 'mark_found':
      return range(s.lost).map((k) =>
        s.status === 'archived'
          ? { ...s, lost: s.lost - k, signed: s.signed + k }
          : afterReturn(s, { ...s, lost: s.lost - k, toSign: s.toSign + k }),
      );
    default:
      return [];
  }
}

/** Signature, par le collaborateur, du document que la machine attend. */
function collaboratorSignature(s: ModelState): ModelState | null {
  const document = pendingDocument(toFacts(s));
  if (!document) return null;
  const status = statusAfterSignature(s.status, document, s.lost > 0);
  expect(status, `signature ${document} refusée depuis ${key(s)}`).not.toBeNull();
  if (document === 'restitution') return { ...s, status: status!, toSign: 0, signed: s.signed + s.toSign };
  return { ...s, status: status! };
}

const ACTIONS: readonly BonActionName[] = [
  'send', 'send_in_person', 'cancel', 'handover_without_signature', 'close_without_signature', 'start_restitution',
  'restitution_in_person', 'undo_return', 'declare_not_returned', 'mark_found',
];

function successors(s: ModelState): ModelState[] {
  const f = toFacts(s);
  const byIt = ACTIONS.filter((a) => isActionInScope(a, f) && actionBlockedReason(a, f) === null).flatMap((a) =>
    itEffects(s, a),
  );
  const signed = collaboratorSignature(s);
  return signed ? [...byIt, signed] : byIt;
}

function explore(): Map<string, ModelState> {
  const seen = new Map<string, ModelState>();
  const queue: ModelState[] = [true, false].map((reachable) => ({
    status: 'draft' as BonStatus, out: COUNT, toSign: 0, signed: 0, lost: 0, reachable,
  }));
  while (queue.length > 0) {
    const s = queue.shift()!;
    if (seen.has(key(s))) continue;
    seen.set(key(s), s);
    queue.push(...successors(s));
  }
  return seen;
}

/** L'état peut-il encore atteindre un statut final (Clôturé ou Annulé) ? */
function canFinish(states: Map<string, ModelState>): Set<string> {
  const done = new Set([...states.values()].filter((s) => TERMINAL.includes(s.status)).map(key));
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of states.values()) {
      if (!done.has(key(s)) && successors(s).some((n) => done.has(key(n)))) {
        done.add(key(s));
        grew = true;
      }
    }
  }
  return done;
}

describe('machine à états — propriétés sur tous les états atteignables', () => {
  const states = explore();

  it('aucune impasse : tout bon atteignable peut encore être clôturé ou annulé', () => {
    const finishing = canFinish(states);
    const stuck = [...states.values()].filter((s) => !finishing.has(key(s)));
    expect(stuck).toEqual([]);
  });

  it('un collaborateur injoignable (compte désactivé, sans adresse) ne bloque jamais le bon', () => {
    const unreachable = [...states.values()].filter((s) => !s.reachable && !TERMINAL.includes(s.status));
    expect(unreachable.length).toBeGreaterThan(5);
    const finishing = canFinish(states);
    expect(unreachable.every((s) => finishing.has(key(s)))).toBe(true);
  });

  it('les comptes d’équipements restent cohérents et le sous-état est toujours défini en restitution', () => {
    for (const s of states.values()) {
      expect(s.out + s.toSign + s.signed + s.lost).toBe(COUNT);
      if (s.status === 'partially_returned') expect(subStatus(toFacts(s))).not.toBeNull();
      if (s.status === 'active') expect(s.out).toBe(COUNT);
    }
  });

  it('aucune action dangereuse hors de propos : pas d’annulation ni de modification après la remise signée', () => {
    for (const s of states.values()) {
      const f = toFacts(s);
      const late = !['draft', 'sent_mise_dispo'].includes(s.status);
      if (late) {
        expect(isActionInScope('cancel', f)).toBe(false);
        expect(isActionInScope('edit', f)).toBe(false);
      }
      // Clôturer sans signature laisserait du matériel dehors sans trace.
      if (isActionInScope('close_without_signature', f)) expect(s.out).toBe(0);
    }
  });

  it('« Restitution en cours » sans rien dehors, sans perte ni signature attendue n’est jamais atteint', () => {
    const empty = [...states.values()].filter(
      (s) => s.status === 'partially_returned' && s.out === 0 && s.lost === 0 && s.toSign === 0,
    );
    expect(empty).toEqual([]);
  });
});
