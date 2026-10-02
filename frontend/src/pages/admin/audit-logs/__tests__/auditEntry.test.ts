import { describe, expect, it } from 'vitest';
import { describeAuditEntry } from '../auditEntry';
import { exportFilters, filterQuery, readFilters } from '../auditFilters';
import type { AuditLogEntry } from '../types';

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: 'l1', bonId: null, userId: null, userEmail: null, action: 'bon_created', details: null,
    ipAddress: '10.0.0.1', userAgent: 'Firefox', createdAt: '2026-09-24T12:00:00.000Z', bon: null, user: null,
    ...overrides,
  };
}

describe('describeAuditEntry', () => {
  it('raconte un changement de paramètres avec la rubrique et le résumé, sans clé technique', () => {
    const view = describeAuditEntry(entry({
      action: 'config_updated',
      user: { id: 'u1', displayName: 'Marie Martin', email: 'marie@livio.fr' },
      details: {
        category: 'smtp', section: 'Email / SMTP', summary: 'Serveur SMTP : « a » → « b » ; Mot de passe : modifié',
        changes: [{ key: 'smtp.host', label: 'Serveur SMTP', from: 'a', to: 'b' }],
      },
    }));
    expect(view.label).toBe('Paramètres modifiés');
    expect(view.tone).toBe('warning');
    expect(view.sentence).toBe(
      'Marie Martin a modifié les paramètres « Email / SMTP » : Serveur SMTP : « a » → « b » ; Mot de passe : modifié.',
    );
  });

  it('nomme le système quand l’entrée n’a pas d’auteur, et la référence du bon', () => {
    const view = describeAuditEntry(entry({ action: 'bon_anonymized', bon: { id: 'b1', reference: 'BON-2026-0042' } }));
    expect(view.sentence).toBe('Le système a anonymisé le bon BON-2026-0042 au terme de sa durée de conservation.');
  });

  it('garde lisible une action inconnue du catalogue', () => {
    const view = describeAuditEntry(entry({ action: 'ancienne_action', userEmail: 'x@livio.fr' }));
    expect(view).toEqual({ label: 'ancienne_action', tone: 'technical', sentence: 'x@livio.fr a effectué une action non répertoriée.' });
  });
});

describe('filtres de l’adresse', () => {
  it('relit les filtres valides et ignore les valeurs illisibles', () => {
    expect(readFilters('?user=%20jean%20&domain=config&action=inconnue&dateFrom=2026-09-01&dateTo=hier')).toEqual({
      user: 'jean', domain: 'config', action: '', dateFrom: '2026-09-01', dateTo: '',
    });
  });

  it('reconstruit la requête et décrit les filtres en français', () => {
    const filters = readFilters('?user=jean&action=config_updated&dateFrom=2026-09-01');
    expect(filterQuery(filters).toString()).toBe('user=jean&action=config_updated&dateFrom=2026-09-01');
    expect(exportFilters(filters)).toEqual([
      { label: 'Auteur', value: 'jean' },
      { label: 'Action', value: 'Paramètres modifiés' },
      { label: 'Du', value: '01/09/2026' },
    ]);
    expect(exportFilters(readFilters(''))).toEqual([]);
  });
});
