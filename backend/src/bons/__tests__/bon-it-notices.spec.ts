import type { FactsSignature } from '../workflow/bon-facts';
import { contestationNotice, ContestationRow, linkRequestNotice, NoticeBonState } from '../bon-it-notices';

const T0 = new Date('2026-09-27T10:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function row(overrides: Partial<ContestationRow> = {}): ContestationRow {
  return {
    id: 'c1',
    message: 'Je n’ai pas rendu la souris.',
    createdAt: T0,
    status: 'resolved',
    outcome: 'founded',
    contestedDocument: 'restitution',
    resolvedAt: at(10),
    resolutionMessage: 'Nous corrigeons.',
    reviewedBy: { id: 'u1', displayName: 'Thomas Girard' },
    ...overrides,
  };
}

function link(type: string, createdAt: Date, extra: Partial<FactsSignature> = {}): FactsSignature {
  return {
    type, signed: false, signedAt: null, tokenExpiresAt: at(10_000), createdAt, isInPerson: false, pdfType: null, ...extra,
  };
}

function state(overrides: Partial<NoticeBonState> = {}): NoticeBonState {
  return { status: 'sent_restitution', pendingDocument: 'restitution', signatures: [], ...overrides };
}

describe('contestationNotice', () => {
  it('bon contesté, contestation ouverte : étape « open » avec le motif et la prise en charge', () => {
    const notice = contestationNotice(
      row({ status: 'open', outcome: null, resolvedAt: null }),
      state({ status: 'contested', pendingDocument: null }),
      [],
    );
    expect(notice).toMatchObject({
      id: 'c1', stage: 'open', message: 'Je n’ai pas rendu la souris.', reviewedBy: { displayName: 'Thomas Girard' },
    });
  });

  it('contestation prise en charge (en cours d’examen) : toujours à trancher, étape « open »', () => {
    const notice = contestationNotice(
      row({ status: 'in_review', outcome: null, resolvedAt: null }),
      state({ status: 'contested', pendingDocument: null }),
      [],
    );
    expect(notice).toMatchObject({ id: 'c1', stage: 'open', reviewedBy: { displayName: 'Thomas Girard' } });
  });

  it('Fondée sur la restitution, rien corrigé depuis : étape « correction »', () => {
    const notice = contestationNotice(row(), state({ signatures: [link('restitution', at(1))] }), []);
    expect(notice).toMatchObject({ stage: 'correction', contestedDocument: 'restitution', resolvedAt: at(10).toISOString() });
  });

  it('un marquage annulé après la décision : plus de rappel', () => {
    expect(contestationNotice(row(), state(), [at(12)])).toBeNull();
  });

  it('une nouvelle signature IT après la décision : plus de rappel', () => {
    const it = link('it_cachet', at(15), { signed: true, signedAt: at(15), pdfType: 'restitution' });
    expect(contestationNotice(row(), state({ signatures: [it] }), [])).toBeNull();
  });

  it('un nouveau lien après la décision : plus de rappel', () => {
    expect(contestationNotice(row(), state({ signatures: [link('restitution', at(20))] }), [])).toBeNull();
  });

  it('Fondée sur une remise (bon remplaçant) ou Non retenue : pas de correction sur ce bon', () => {
    expect(contestationNotice(row({ contestedDocument: 'mise_disposition' }), state({ status: 'active', pendingDocument: null }), [])).toBeNull();
    expect(contestationNotice(row({ outcome: 'not_retained', status: 'rejected' }), state(), [])).toBeNull();
  });

  it('le document rouvert n’attend plus (bon clôturé depuis) : pas de rappel', () => {
    expect(contestationNotice(row(), state({ status: 'archived', pendingDocument: null }), [])).toBeNull();
  });

  it('aucune contestation : rien', () => {
    expect(contestationNotice(null, state(), [])).toBeNull();
  });
});

describe('linkRequestNotice', () => {
  it('demande postérieure au dernier lien : rappelée avec le document', () => {
    const notice = linkRequestNotice(at(30), state({ signatures: [link('restitution', at(1))] }));
    expect(notice).toEqual({ requestedAt: at(30).toISOString(), documentType: 'restitution' });
  });

  it('l’IT a renvoyé depuis : plus de rappel', () => {
    expect(linkRequestNotice(at(30), state({ signatures: [link('restitution', at(40))] }))).toBeNull();
  });

  it('rien n’attend la signature, ou aucune demande : rien', () => {
    expect(linkRequestNotice(at(30), state({ pendingDocument: null }))).toBeNull();
    expect(linkRequestNotice(null, state())).toBeNull();
  });
});
