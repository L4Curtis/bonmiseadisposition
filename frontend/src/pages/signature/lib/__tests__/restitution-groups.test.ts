import { describe, expect, it } from 'vitest';
import { pendingRestitutionGroups } from '../restitution-groups';

const pc = { id: 'pc', returnedAt: '2026-09-28T09:00:00Z', notReturned: false };
const ecran = { id: 'ecran', returnedAt: '2026-09-28T10:00:00Z', notReturned: false };
const souris = { id: 'souris', returnedAt: null, notReturned: false };
const perdu = { id: 'perdu', returnedAt: null, notReturned: true };
const ids = (list: readonly { id: string }[]) => list.map((e) => e.id);

describe('restitution à signer, en plusieurs fois (constat n° 2)', () => {
  it('2e restitution : l’écran cette fois, le PC déjà rendu, la souris gardée', () => {
    const signatures = [{ type: 'restitution', signed: true, signedAt: '2026-09-28T09:30:00Z' }];
    const groups = pendingRestitutionGroups([pc, ecran, souris, perdu], signatures);
    expect(ids(groups.returnedNow)).toEqual(['ecran']);
    expect(ids(groups.returnedBefore)).toEqual(['pc']);
    expect(ids(groups.stillHeld)).toEqual(['souris']);
  });

  it('1re restitution : tout ce qui est marqué rendu est rendu cette fois', () => {
    const groups = pendingRestitutionGroups([pc, ecran, souris], []);
    expect(ids(groups.returnedNow)).toEqual(['pc', 'ecran']);
    expect(groups.returnedBefore).toEqual([]);
  });

  it('une restitution signée puis invalidée ne compte pas comme précédente', () => {
    const signatures = [{ type: 'restitution', signed: true, signedAt: '2026-09-28T09:30:00Z', invalidatedAt: '2026-09-28T09:40:00Z' }];
    expect(ids(pendingRestitutionGroups([pc, ecran], signatures).returnedNow)).toEqual(['pc', 'ecran']);
  });
});
