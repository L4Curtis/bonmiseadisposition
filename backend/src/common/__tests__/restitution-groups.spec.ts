import { describe, expect, it } from 'vitest';
import { groupRestitutionEquipments, restitutionWindowUntil } from '../restitution-groups';

const d = (iso: string) => new Date(`2026-09-28T${iso}:00Z`);
const pc = { id: 'pc', returnedAt: d('09:00'), notReturned: false };
const ecran = { id: 'ecran', returnedAt: d('10:00'), notReturned: false };
const souris = { id: 'souris', returnedAt: null, notReturned: false };
const perdu = { id: 'perdu', returnedAt: null, notReturned: true };
const firstSigned = { type: 'restitution', signed: true, signedAt: d('09:30') };

describe('restitution en plusieurs fois : ce que couvre chaque document', () => {
  it('2e restitution à signer : l’écran rendu cette fois, le PC déjà rendu, la souris gardée', () => {
    const groups = groupRestitutionEquipments([pc, ecran, souris, perdu], restitutionWindowUntil([firstSigned], null));
    expect(groups.returnedNow.map((e) => e.id)).toEqual(['ecran']);
    expect(groups.returnedBefore.map((e) => e.id)).toEqual(['pc']);
    expect(groups.stillHeld.map((e) => e.id)).toEqual(['souris', 'perdu']);
  });

  it('1re restitution une fois signée : seul le PC, l’écran rendu plus tard était encore détenu', () => {
    const groups = groupRestitutionEquipments([pc, ecran, souris], restitutionWindowUntil([firstSigned], firstSigned.signedAt));
    expect(groups.returnedNow.map((e) => e.id)).toEqual(['pc']);
    expect(groups.returnedBefore).toEqual([]);
    expect(groups.stillHeld.map((e) => e.id)).toEqual(['ecran', 'souris']);
  });

  it('une restitution signée puis invalidée ne borne pas la fenêtre', () => {
    const invalidated = { ...firstSigned, invalidatedAt: d('09:45') };
    expect(restitutionWindowUntil([invalidated], null)).toEqual({ after: null, until: null });
  });
});
