import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SafeSignature } from '@/contracts';
import { BonSignatures, invalidationLabel } from '../BonSignatures';

function sig(overrides: Partial<SafeSignature>): SafeSignature {
  return {
    id: 's1', type: 'it_cachet', signed: true, signedAt: '2026-09-27T12:31:00.000Z', signerEmail: 'thomas@livio.fr',
    mentionLuApprouve: false, isInPerson: false, tokenExpiresAt: '2026-10-04T12:31:00.000Z',
    createdAt: '2026-09-27T12:31:00.000Z', pdfType: 'restitution', invalidatedAt: null, invalidatedReason: null, ...overrides,
  };
}

describe('BonSignatures — motifs justes (IB n° 7, IB n° 9)', () => {
  it('annulation d’un marquage : « Restitution corrigée », jamais « Bon modifié »', () => {
    expect(invalidationLabel({ type: 'restitution', pdfType: null, invalidatedReason: 'modified' })).toBe('Restitution corrigée');
    expect(invalidationLabel({ type: 'mise_disposition', pdfType: null, invalidatedReason: 'modified' })).toBe('Bon modifié');
  });

  it('motif « return_corrected » : son libellé, sur le lien comme sur la signature IT', () => {
    expect(invalidationLabel({ type: 'restitution', pdfType: null, invalidatedReason: 'return_corrected' })).toBe('Restitution corrigée');
    render(<BonSignatures collaborateurName="Léa Martin" signatures={[
      sig({ invalidatedAt: '2026-09-27T13:00:00.000Z', invalidatedReason: 'return_corrected' }),
    ]} />);
    expect(screen.getByText(/Ne vaut plus depuis le .* \(restitution corrigée\)/)).toBeInTheDocument();
  });

  it('signature IT retirée par une contestation Fondée : le motif réel est affiché', () => {
    render(<BonSignatures collaborateurName="Léa Martin" signatures={[
      sig({ invalidatedAt: '2026-09-27T13:00:00.000Z', invalidatedReason: 'contested' }),
    ]} />);
    expect(screen.getByText(/Ne vaut plus depuis le .* \(bon contesté\)/)).toBeInTheDocument();
    expect(screen.queryByText(/bon modifié/)).not.toBeInTheDocument();
  });

  it('PV certifié mais pas encore parti : la fiche dit quand il partira', () => {
    render(<BonSignatures collaborateurName="Lucas Roux" subStatus="loss_declared" signatures={[sig({ pdfType: 'pv_cloture' })]} />);
    expect(screen.getByText(/PV prêt : il partira/)).toBeInTheDocument();
  });
});

describe('BonSignatures — signataires par leur nom (IB n° 13)', () => {
  it('signature IT : le nom du technicien, pas son adresse', () => {
    render(<BonSignatures collaborateurName="Léa Martin" signatures={[sig({ signerName: 'Thomas Girard' })]} />);
    expect(screen.getByText(/par Thomas Girard/)).toBeInTheDocument();
    expect(screen.queryByText(/thomas@livio\.fr/)).not.toBeInTheDocument();
  });

  it('au guichet : « en présence de » le nom du technicien témoin', () => {
    render(<BonSignatures collaborateurName="Léa Martin" signatures={[
      sig({ type: 'restitution', isInPerson: true, signedByProxy: true, signerName: 'Thomas Girard', pdfType: null }),
    ]} />);
    expect(screen.getByText(/par Léa Martin, au guichet, en présence de Thomas Girard/)).toBeInTheDocument();
  });

  it('au guichet, signé depuis un autre compte que celui du titulaire : « en présence de » ce compte', () => {
    render(<BonSignatures collaborateurName="Léa Martin" collaborateurEmail="Lea.Martin@livio.fr" signatures={[
      sig({ type: 'restitution', isInPerson: true, signedByProxy: false, signerName: 'Thomas Girard', pdfType: null }),
    ]} />);
    expect(screen.getByText(/au guichet, en présence de Thomas Girard/)).toBeInTheDocument();
  });

  it('au guichet, signé depuis le compte du titulaire : aucun témoin inventé', () => {
    render(<BonSignatures collaborateurName="Léa Martin" collaborateurEmail="Lea.Martin@livio.fr" signatures={[
      sig({ type: 'restitution', isInPerson: true, signedByProxy: true, signerEmail: 'lea.martin@livio.fr', signerName: 'Léa Martin', pdfType: null }),
    ]} />);
    expect(screen.getByText(/par Léa Martin, au guichet$/)).toBeInTheDocument();
    expect(screen.queryByText(/en présence de/)).not.toBeInTheDocument();
  });

  it('compte inconnu : l’adresse reste le repli', () => {
    render(<BonSignatures collaborateurName="Léa Martin" signatures={[sig({ signerName: null })]} />);
    expect(screen.getByText(/par thomas@livio\.fr/)).toBeInTheDocument();
  });
});
