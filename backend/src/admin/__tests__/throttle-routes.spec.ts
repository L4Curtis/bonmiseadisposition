import { describe, expect, it } from 'vitest';
import { ConfigController } from '../config.controller';
import { AdminLdapController } from '../admin-ldap.controller';
import { AdminSmbController } from '../admin-smb.controller';
import { RetentionController } from '../../retention/retention.controller';
import { AuditController } from '../../audit/audit.controller';
import { EmailTemplatesController } from '../../templates/email-templates.controller';
import { PdfTemplatesController } from '../../pdf/pdf-templates.controller';

/** Limite par minute posée par `@Throttle` sur une route (undefined : limite globale seule). */
function throttleLimit(controller: { prototype: object }, handler: string): number | undefined {
  const method = (controller.prototype as Record<string, unknown>)[handler];
  if (typeof method !== 'function') throw new Error(`Route introuvable : ${handler}`);
  return Reflect.getMetadata('THROTTLER:LIMITdefault', method) as number | undefined;
}

describe('Limites de débit des routes d’administration', () => {
  it.each([
    ['test SMTP (peut envoyer un vrai email)', ConfigController, 'testSmtp', 10],
    ['test annuaire', ConfigController, 'testLdap', 10],
    ['test Entra ID', ConfigController, 'testEntra', 10],
    ['test du partage réseau', ConfigController, 'testSmb', 10],
    ['synchronisation de l’annuaire', AdminLdapController, 'triggerSync', 5],
    ['désactivation des comptes de l’annuaire', AdminLdapController, 'deactivateAll', 5],
    ['relance de tous les exports SMB', AdminSmbController, 'retryAll', 5],
    ['email de test d’un modèle', EmailTemplatesController, 'sendTest', 10],
    ['email de test d’un modèle avec un bon', EmailTemplatesController, 'sendTestWithBon', 10],
    ['import des modèles d’email', EmailTemplatesController, 'importAll', 10],
    ['import des modèles PDF', PdfTemplatesController, 'importAll', 10],
    ['export du journal d’audit', AuditController, 'exportCsv', 10],
  ])('%s : limite dédiée', (_label, controller, handler, limit) => {
    expect(throttleLimit(controller, handler)).toBe(limit);
  });

  it('la rétention lancée à la main est limitée (aperçu comme exécution)', () => {
    const limited = Object.getOwnPropertyNames(RetentionController.prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) => throttleLimit(RetentionController, name) === 5);
    expect(limited.length).toBeGreaterThanOrEqual(2);
  });
});
