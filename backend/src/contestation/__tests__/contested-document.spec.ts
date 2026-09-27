import { resolveContestedDocument } from '../contested-document';

describe('resolveContestedDocument — quel document le collaborateur conteste', () => {
  it('bon « En cours » : la remise qu’il a signée', () => {
    expect(resolveContestedDocument({ status: 'active', pendingDocuments: [] })).toEqual({
      contestable: true,
      document: 'mise_disposition',
    });
  });

  it('« Restitution à signer » : la restitution', () => {
    expect(resolveContestedDocument({ status: 'sent_restitution', pendingDocuments: ['restitution'] })).toEqual({
      contestable: true,
      document: 'restitution',
    });
  });

  it('« Restitution à signer » même si la ligne de signature a été purgée : la restitution', () => {
    expect(resolveContestedDocument({ status: 'sent_restitution', pendingDocuments: [] })).toEqual({
      contestable: true,
      document: 'restitution',
    });
  });

  it('« Restitution en cours » avec un PV à signer : le PV, prioritaire sur une restitution', () => {
    expect(
      resolveContestedDocument({ status: 'partially_returned', pendingDocuments: ['restitution', 'pv_cloture'] }),
    ).toEqual({ contestable: true, document: 'pv_cloture' });
  });

  it('« Restitution en cours » avec une restitution partielle à signer : la restitution', () => {
    expect(resolveContestedDocument({ status: 'partially_returned', pendingDocuments: ['restitution'] })).toEqual({
      contestable: true,
      document: 'restitution',
    });
  });

  it('« Restitution en cours » sans rien à signer : refus expliqué', () => {
    const result = resolveContestedDocument({ status: 'partially_returned', pendingDocuments: [] });
    expect(result.contestable).toBe(false);
    if (!result.contestable) expect(result.message).toMatch(/aucun document/i);
  });

  it('« Remise à signer » : pas de contestation, on ne signe pas un bon faux', () => {
    const result = resolveContestedDocument({ status: 'sent_mise_dispo', pendingDocuments: ['mise_disposition'] });
    expect(result.contestable).toBe(false);
    if (!result.contestable) expect(result.message).toMatch(/ne le signez pas/);
  });

  it.each(['draft', 'archived', 'cancelled', 'contested'] as const)('statut %s : refus', (status) => {
    expect(resolveContestedDocument({ status, pendingDocuments: [] }).contestable).toBe(false);
  });
});
