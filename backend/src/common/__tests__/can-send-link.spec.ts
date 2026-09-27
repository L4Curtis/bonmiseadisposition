import { BadRequestException } from '@nestjs/common';
import type { LinkRefusalReason as ContractLinkRefusalReason } from '../../contracts/bons';
import { assertCanSendLink, canSendLink, LINK_REFUSAL_REASONS, LinkRefusalReason } from '../can-send-link';
import { isDeliverableEmail } from '../email';

type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Ne compile que si les motifs de la règle sont exactement ceux du contrat d'API. */
const REASONS_MATCH_CONTRACT: SameUnion<ContractLinkRefusalReason, LinkRefusalReason> = true;

describe('canSendLink — peut-on envoyer un lien à ce collaborateur ?', () => {
  it('autorise un compte actif à l’adresse délivrable, et renvoie l’adresse nettoyée', () => {
    expect(canSendLink({ active: true, email: '  Lea.Martin@Groupe-Livio.com ' })).toEqual({
      allowed: true,
      email: 'Lea.Martin@Groupe-Livio.com',
    });
  });

  it('refuse un compte désactivé (départ), même avec une adresse valide', () => {
    const result = canSendLink({ active: false, email: 'paul.rousseau@groupe-livio.com' });
    expect(result).toMatchObject({ allowed: false, reason: 'inactive_account' });
    expect(result.allowed === false && result.message).toMatch(/compte du collaborateur est désactivé/);
    expect(result.allowed === false && result.message).toMatch(/au guichet/);
  });

  it('le compte désactivé passe avant l’adresse manquante', () => {
    expect(canSendLink({ active: false, email: null })).toMatchObject({ reason: 'inactive_account' });
  });

  it.each([null, undefined, '', '   '])('refuse un compte sans adresse (%p)', (email) => {
    const result = canSendLink({ active: true, email });
    expect(result).toMatchObject({ allowed: false, reason: 'no_email' });
    expect(result.allowed === false && result.message).toMatch(/n'a pas d'adresse email/);
  });

  it.each(['admin@local', 'jean@exemple', 'sans-arobase'])('refuse une adresse non délivrable (%s) en la citant', (email) => {
    const result = canSendLink({ active: true, email });
    expect(result).toMatchObject({ allowed: false, reason: 'undeliverable_email' });
    expect(result.allowed === false && result.message).toContain(email);
    expect(result.allowed === false && result.message).toMatch(/Corrigez l'adresse du compte/);
  });

  it('garde la casse de l’adresse et retire tabulations, retours à la ligne et espaces insécables autour', () => {
    expect(canSendLink({ active: true, email: '\t Lea.MARTIN@Groupe-Livio.COM\n' })).toEqual({
      allowed: true,
      email: 'Lea.MARTIN@Groupe-Livio.COM',
    });
  });

  it.each(['x@local', 'lea martin@groupe-livio.com', 'lea@@groupe-livio.com', 'lea@groupe-livio.c'])(
    'même verdict que isDeliverableEmail pour %s : refusée',
    (email) => {
      expect(isDeliverableEmail(email)).toBe(false);
      expect(canSendLink({ active: true, email })).toMatchObject({ allowed: false, reason: 'undeliverable_email' });
    },
  );

  it('le résultat est figé : un appelant ne peut pas le modifier', () => {
    const result = canSendLink({ active: true, email: 'a@b.fr' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('expose la liste fermée des motifs de refus, identique au contrat d’API', () => {
    expect(LINK_REFUSAL_REASONS).toEqual(['inactive_account', 'no_email', 'undeliverable_email']);
    expect(REASONS_MATCH_CONTRACT).toBe(true);
  });
});

describe('assertCanSendLink', () => {
  it('renvoie l’adresse à utiliser quand l’envoi est permis', () => {
    expect(assertCanSendLink({ active: true, email: ' lea@groupe-livio.com' })).toBe('lea@groupe-livio.com');
  });

  it('lève une erreur 400 avec le message français quand l’envoi est refusé', () => {
    const call = () => assertCanSendLink({ active: false, email: 'lea@groupe-livio.com' });
    expect(call).toThrow(BadRequestException);
    expect(call).toThrow(/compte du collaborateur est désactivé/);
  });
});
