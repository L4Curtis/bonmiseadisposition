import { describe, expect, it } from 'vitest';
import { AppException } from '../../common/errors';
import { describeConfigChanges, validateConfigUpdate } from '../config-update';

const noFilterCheck = () => undefined;

function rejection(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppException) {
      const body = err.getResponse() as { code: string; message: string };
      return { code: body.code, message: body.message };
    }
    throw err;
  }
  throw new Error('aucune erreur levée');
}

describe('validateConfigUpdate — contrôle d’une rubrique avant enregistrement', () => {
  it('refuse une rubrique inconnue', () => {
    expect(rejection(() => validateConfigUpdate('inconnue', {}, noFilterCheck))).toEqual({
      code: 'unknown_config_category',
      message: 'Rubrique de configuration inconnue : inconnue',
    });
  });

  it('refuse une clé qui n’existe pas dans le registre', () => {
    const err = rejection(() => validateConfigUpdate('smtp', { hote: 'x' }, noFilterCheck));
    expect(err.code).toBe('unknown_config_key');
    expect(err.message).toContain('hote');
  });

  it('refuse une valeur qui n’est pas une chaîne', () => {
    const err = rejection(() => validateConfigUpdate('smtp', { port: 25 as unknown as string }, noFilterCheck));
    expect(err.code).toBe('validation_failed');
  });

  it('refuse un entier hors bornes, en citant le libellé et les bornes', () => {
    const err = rejection(() => validateConfigUpdate('tokens', { expiry_days: '45' }, noFilterCheck));
    expect(err.code).toBe('validation_failed');
    expect(err.message).toBe('Validité des liens de signature (jours) : un nombre entier entre 1 et 30 est attendu.');
  });

  it('refuse un seuil de retard de signature au-delà de 90 jours', () => {
    const err = rejection(() => validateConfigUpdate('rappels', { signature_overdue_days: '500' }, noFilterCheck));
    expect(err.code).toBe('validation_failed');
    expect(err.message).toBe('Signature en retard après (jours) : un nombre entier entre 1 et 90 est attendu.');
    expect(validateConfigUpdate('rappels', { signature_overdue_days: '90' }, noFilterCheck)).toEqual({
      signature_overdue_days: '90',
    });
  });

  it('accepte un entier dans les bornes et le normalise (« 007 » → « 7 »)', () => {
    expect(validateConfigUpdate('tokens', { expiry_days: ' 007 ' }, noFilterCheck)).toEqual({ expiry_days: '7' });
  });

  it('refuse un interrupteur qui ne vaut ni « true » ni « false »', () => {
    expect(rejection(() => validateConfigUpdate('smb', { enabled: 'oui' }, noFilterCheck)).code).toBe('validation_failed');
  });

  it('refuse une adresse d’expéditeur invalide', () => {
    expect(rejection(() => validateConfigUpdate('smtp', { from: 'IT <noreply>' }, noFilterCheck)).code).toBe(
      'validation_failed',
    );
  });

  it('refuse une URL qui n’est pas http(s), et retire la barre finale d’une URL valide', () => {
    expect(rejection(() => validateConfigUpdate('general', { app_url: 'ftp://x' }, noFilterCheck)).code).toBe(
      'validation_failed',
    );
    expect(validateConfigUpdate('general', { app_url: 'https://bons.livio.fr//' }, noFilterCheck)).toEqual({
      app_url: 'https://bons.livio.fr',
    });
  });

  it('accepte une valeur vide : la valeur par défaut s’appliquera', () => {
    expect(validateConfigUpdate('rappels', { delay_1: '', enabled: '' }, noFilterCheck)).toEqual({
      delay_1: '',
      enabled: '',
    });
  });

  it('fait vérifier le filtre LDAP et rapporte son erreur', () => {
    const check = (filter: string) => {
      if (!filter.startsWith('(')) throw new Error('Filtre LDAP invalide : doit commencer par "("');
    };
    const err = rejection(() => validateConfigUpdate('ldap', { user_filter: 'objectClass=person' }, check));
    expect(err.message).toContain('Filtre LDAP invalide');
  });

  it('refuse une valeur de plus de 2 000 caractères', () => {
    expect(
      rejection(() => validateConfigUpdate('smtp', { host: 'a'.repeat(2001) }, noFilterCheck)).code,
    ).toBe('validation_failed');
  });
});

describe('describeConfigChanges — ce que le journal retient d’un enregistrement', () => {
  it('ne retient que les réglages réellement modifiés, avec libellé, ancienne et nouvelle valeur', () => {
    const details = describeConfigChanges(
      'smtp',
      { host: 'smtp.old.fr', port: '587', secure: null },
      { host: 'smtp.new.fr', port: '587', secure: '' },
    );
    expect(details).toEqual({
      category: 'smtp',
      section: 'Email / SMTP',
      summary: 'Serveur SMTP : « smtp.old.fr » → « smtp.new.fr »',
      changes: [{ key: 'smtp.host', label: 'Serveur SMTP', from: 'smtp.old.fr', to: 'smtp.new.fr' }],
    });
  });

  it('ne note jamais la valeur d’un secret, seulement qu’il a été modifié', () => {
    const details = describeConfigChanges('smtp', { password: 'ancien-secret' }, { password: 'nouveau-secret' });
    expect(details?.changes).toEqual([{ key: 'smtp.password', label: 'Mot de passe', secret: true }]);
    expect(details?.summary).toBe('Mot de passe : modifié');
    expect(JSON.stringify(details)).not.toMatch(/secret-|ancien|nouveau/);
  });

  it('ne note pas un secret renvoyé identique', () => {
    expect(describeConfigChanges('smtp', { password: 'meme' }, { password: 'meme' })).toBeNull();
  });

  it('écrit « vide » pour un réglage effacé ou jamais saisi', () => {
    const details = describeConfigChanges('rappels', { delay_1: '5' }, { delay_1: '' });
    expect(details?.summary).toBe('Premier rappel (jours après l’envoi) : « 5 » → vide');
    expect(details?.changes[0]).toEqual({
      key: 'rappels.delay_1',
      label: 'Premier rappel (jours après l’envoi)',
      from: '5',
      to: null,
    });
  });

  it('renvoie null quand rien n’a changé', () => {
    expect(describeConfigChanges('tokens', { expiry_days: '7' }, { expiry_days: '7' })).toBeNull();
  });
});

describe('describeConfigChanges — lisibilité du journal', () => {
  it('écrit un interrupteur « activé » / « désactivé », jamais « true » / « false »', () => {
    const details = describeConfigChanges('smtp', { secure: 'false' }, { secure: 'true' });
    expect(details?.summary).toBe('Connexion chiffrée (TLS) : « désactivé » → « activé »');
    expect(details?.summary).not.toMatch(/true|false/);
  });

  it('trace lisiblement un réglage vide, puis rempli, puis vidé', () => {
    const filled = describeConfigChanges('smtp', { host: null }, { host: 'smtp.livio.fr' });
    const emptied = describeConfigChanges('smtp', { host: 'smtp.livio.fr' }, { host: '' });
    expect(filled?.summary).toBe('Serveur SMTP : vide → « smtp.livio.fr »');
    expect(emptied?.summary).toBe('Serveur SMTP : « smtp.livio.fr » → vide');
  });
});
