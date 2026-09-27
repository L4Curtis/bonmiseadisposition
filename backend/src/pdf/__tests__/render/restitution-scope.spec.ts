import { groupRestitutionEquipments, restitutionWindow } from '../../render/restitution-scope';
import type { PdfSignature } from '../../pdf-types';

/** Ce que couvre un document de restitution : rendus dans CETTE restitution,
 *  déjà rendus avant (cumul), et restés chez le collaborateur. */
describe('restitution-scope', () => {
  const at = (hhmm: string) => new Date(`2026-09-27T${hhmm}:00Z`);
  const eq = (id: string, returnedAt: Date | null, notReturned = false) => ({ id, returnedAt, notReturned });
  const restitution = (signedAt: Date): PdfSignature => ({ type: 'restitution', signed: true, signedAt });
  const equipments = [eq('pc', at('13:00')), eq('ecran', at('13:03:30'.slice(0, 5))), eq('souris', null), eq('sac', null, true)];

  it('première restitution signée : seul ce qui a été rendu avant sa signature ; le reste est gardé', () => {
    const first = restitution(at('13:02'));
    const groups = groupRestitutionEquipments(equipments, restitutionWindow([first, restitution(at('13:04'))], first));
    expect(groups.returnedNow.map((e) => e.id)).toEqual(['pc']);
    expect(groups.returnedBefore).toEqual([]);
    // L'écran, rendu APRÈS cette signature, était encore chez le collaborateur.
    expect(groups.stillHeld.map((e) => e.id)).toEqual(['ecran', 'souris', 'sac']);
  });

  it('seconde restitution : ce document couvre l’écran, rappelle le PC, garde la souris', () => {
    const second = restitution(at('13:04'));
    const groups = groupRestitutionEquipments(equipments, restitutionWindow([restitution(at('13:02')), second], second));
    expect(groups.returnedNow.map((e) => e.id)).toEqual(['ecran']);
    expect(groups.returnedBefore.map((e) => e.id)).toEqual(['pc']);
    expect(groups.stillHeld.map((e) => e.id)).toEqual(['souris', 'sac']);
  });

  it('version IT pas encore signée par le collaborateur : tout ce qui est marqué depuis la dernière restitution signée', () => {
    const groups = groupRestitutionEquipments(equipments, restitutionWindow([restitution(at('13:02'))], null));
    expect(groups.returnedNow.map((e) => e.id)).toEqual(['ecran']);
    expect(groups.returnedBefore.map((e) => e.id)).toEqual(['pc']);
  });
});
