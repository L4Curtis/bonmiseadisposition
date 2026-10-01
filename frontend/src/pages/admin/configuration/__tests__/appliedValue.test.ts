import { describe, expect, it } from 'vitest';
import type { ConfigRegistryEntry } from '@/contracts/config-registry';
import { appliedValueCaption, toggleChecked } from '../appliedValue';

function entry(overrides: Partial<ConfigRegistryEntry>): ConfigRegistryEntry {
  return {
    key: 'rappels.delay_1',
    category: 'rappels',
    name: 'delay_1',
    label: 'Premier rappel (jours après l’envoi)',
    type: 'integer',
    min: 1,
    max: null,
    secret: false,
    adminOnly: true,
    healthSection: 'rappels',
    storedValue: null,
    defaultValue: 3,
    appliedValue: 3,
    source: 'default',
    adjusted: false,
    ...overrides,
  };
}

describe('appliedValueCaption', () => {
  it('annonce la valeur par défaut quand rien n’est saisi (R-104)', () => {
    expect(appliedValueCaption(entry({}))).toEqual({ text: 'Valeur appliquée : 3 (par défaut)', tone: 'muted' });
  });

  it('traduit un interrupteur par défaut en « activé » / « désactivé »', () => {
    const toggle = entry({ type: 'boolean', defaultValue: true, appliedValue: true, min: null });
    expect(appliedValueCaption(toggle)?.text).toBe('Valeur appliquée : activé (par défaut)');
  });

  it('signale une saisie hors bornes ramenée à la borne', () => {
    const tokens = entry({ storedValue: '90', appliedValue: 30, max: 30, source: 'stored', adjusted: true });
    expect(appliedValueCaption(tokens)).toEqual({
      text: 'La valeur saisie (90) est hors des bornes : valeur appliquée 30 (maximum).',
      tone: 'warning',
    });
  });

  it('signale une saisie illisible remplacée par le défaut', () => {
    const caption = appliedValueCaption(entry({ storedValue: 'abc', source: 'default', adjusted: true }));
    expect(caption).toEqual({ text: 'La valeur saisie (abc) est illisible : valeur appliquée 3 (par défaut).', tone: 'warning' });
  });

  it('dit d’où vient une valeur reprise de la configuration du serveur', () => {
    const url = entry({ type: 'url', defaultValue: null, appliedValue: 'https://bons.livio.fr', source: 'environment' });
    expect(appliedValueCaption(url)?.text).toBe('Valeur appliquée : https://bons.livio.fr (reprise de la configuration du serveur)');
  });

  it('ne dit rien pour une saisie normale ni pour un secret', () => {
    expect(appliedValueCaption(entry({ storedValue: '5', appliedValue: 5, source: 'stored' }))).toBeNull();
    expect(appliedValueCaption(entry({ secret: true }))).toBeNull();
    expect(appliedValueCaption(undefined)).toBeNull();
  });

  it('annonce qu’un réglage sans défaut n’est pas renseigné', () => {
    const host = entry({ type: 'string', defaultValue: null, appliedValue: null });
    expect(appliedValueCaption(host)?.text).toBe('Non renseigné : aucune valeur par défaut.');
  });
});

describe('toggleChecked', () => {
  it('suit la saisie, sinon la valeur appliquée par le serveur', () => {
    const enabledByDefault = entry({ type: 'boolean', defaultValue: true, appliedValue: true });
    expect(toggleChecked('', enabledByDefault)).toBe(true);
    expect(toggleChecked(undefined, enabledByDefault)).toBe(true);
    expect(toggleChecked('false', enabledByDefault)).toBe(false);
    expect(toggleChecked('true', undefined)).toBe(true);
    expect(toggleChecked('', undefined)).toBe(false);
  });
});
