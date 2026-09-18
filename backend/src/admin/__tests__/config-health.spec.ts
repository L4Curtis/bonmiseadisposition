import { computeConfigHealth, ConfigHealthRow, CONFIG_HEALTH_CATEGORIES } from '../config-health';

function row(category: string, key: string, value: string | null, updatedAt = new Date('2026-01-01T00:00:00Z')): ConfigHealthRow {
  return { category, key, value, updatedAt };
}

describe('computeConfigHealth', () => {
  it('renvoie une section pour chaque catégorie couverte, dans l\'ordre du menu', () => {
    const sections = computeConfigHealth([]);
    expect(sections.map((s) => s.key)).toEqual([...CONFIG_HEALTH_CATEGORIES]);
  });

  // ─── general ────────────────────────────────────────────────────────────────

  describe('general', () => {
    it('non_configure quand rien n\'est renseigné et aucune variable FRONTEND_URL', () => {
      const [general] = computeConfigHealth([]);
      expect(general.state).toBe('non_configure');
      expect(general.updatedAt).toBeNull();
    });

    it('configure quand app_url est renseignée en base', () => {
      const [general] = computeConfigHealth([row('general', 'app_url', 'https://bons.exemple.fr')]);
      expect(general.state).toBe('configure');
      expect(general.detail).toContain('configurée');
    });

    it('configure (par repli) quand FRONTEND_URL est définie sans app_url en base', () => {
      const [general] = computeConfigHealth([row('general', 'local_auth_enabled', 'true')], { frontendUrlEnv: 'https://env.exemple.fr' });
      expect(general.state).toBe('configure');
      expect(general.detail).toContain('FRONTEND_URL');
    });

    it('ne renvoie jamais la valeur de app_url dans detail', () => {
      const [general] = computeConfigHealth([row('general', 'app_url', 'https://secret-interne.exemple.fr')]);
      expect(general.detail).not.toContain('secret-interne');
    });
  });

  // ─── ldap (rubrique à interrupteur) ────────────────────────────────────────

  describe('ldap', () => {
    it('non_configure quand rien n\'est renseigné', () => {
      const sections = computeConfigHealth([]);
      const ldap = sections.find((s) => s.key === 'ldap')!;
      expect(ldap.state).toBe('non_configure');
    });

    it('desactive quand enabled=false même si d\'autres clés existent', () => {
      const rows = [row('ldap', 'enabled', 'false'), row('ldap', 'url', 'ldaps://dc.exemple.fr:636')];
      const ldap = computeConfigHealth(rows).find((s) => s.key === 'ldap')!;
      expect(ldap.state).toBe('desactive');
    });

    it('incomplet quand activé mais des clés indispensables manquent, listées dans detail', () => {
      const rows = [row('ldap', 'enabled', 'true'), row('ldap', 'url', 'ldaps://dc.exemple.fr:636')];
      const ldap = computeConfigHealth(rows).find((s) => s.key === 'ldap')!;
      expect(ldap.state).toBe('incomplet');
      expect(ldap.detail).toContain('Search Base');
      expect(ldap.detail).not.toContain('URL LDAP'); // celle-ci est renseignée
    });

    it('ne fuite jamais bind_password : seule sa présence compte', () => {
      const rows = [
        row('ldap', 'enabled', 'true'),
        row('ldap', 'url', 'ldaps://dc.exemple.fr:636'),
        row('ldap', 'search_base', 'DC=exemple,DC=fr'),
        row('ldap', 'bind_dn', 'CN=svc,DC=exemple,DC=fr'),
        row('ldap', 'bind_password', 'ENCRYPTED:abcdef1234567890'),
      ];
      const ldap = computeConfigHealth(rows).find((s) => s.key === 'ldap')!;
      expect(ldap.state).toBe('configure');
      expect(JSON.stringify(ldap)).not.toContain('abcdef1234567890');
    });

    it('reflète la date de dernière modification la plus récente de la rubrique', () => {
      const rows = [
        row('ldap', 'enabled', 'true', new Date('2026-01-01T00:00:00Z')),
        row('ldap', 'url', 'ldaps://dc.exemple.fr:636', new Date('2026-03-15T10:00:00Z')),
      ];
      const ldap = computeConfigHealth(rows).find((s) => s.key === 'ldap')!;
      expect(ldap.updatedAt).toBe(new Date('2026-03-15T10:00:00Z').toISOString());
    });
  });

  // ─── entra (pas d'interrupteur) ─────────────────────────────────────────────

  describe('entra', () => {
    it('non_configure quand rien n\'est renseigné', () => {
      const entra = computeConfigHealth([]).find((s) => s.key === 'entra')!;
      expect(entra.state).toBe('non_configure');
    });

    it('incomplet quand le secret client manque', () => {
      const rows = [
        row('entra', 'tenant_id', 'tid'),
        row('entra', 'client_id', 'cid'),
        row('entra', 'admin_group_id', 'grp-admin'),
        row('entra', 'technician_group_id', 'grp-tech'),
      ];
      const entra = computeConfigHealth(rows).find((s) => s.key === 'entra')!;
      expect(entra.state).toBe('incomplet');
      expect(entra.detail).toContain('Client Secret');
    });

    it('configure quand tenant/client/secret/groupes admin+technicien sont présents (direction optionnel)', () => {
      const rows = [
        row('entra', 'tenant_id', 'tid'),
        row('entra', 'client_id', 'cid'),
        row('entra', 'client_secret', 'ENCRYPTED:xxx'),
        row('entra', 'admin_group_id', 'grp-admin'),
        row('entra', 'technician_group_id', 'grp-tech'),
      ];
      const entra = computeConfigHealth(rows).find((s) => s.key === 'entra')!;
      expect(entra.state).toBe('configure');
    });
  });

  // ─── smtp (pas d'interrupteur) ─────────────────────────────────────────────

  describe('smtp', () => {
    it('incomplet avec le message de conséquence attendu (host/port manquants)', () => {
      const rows = [row('smtp', 'from', 'it@exemple.fr')];
      const smtp = computeConfigHealth(rows).find((s) => s.key === 'smtp')!;
      expect(smtp.state).toBe('incomplet');
      expect(smtp.detail).toContain('SMTP incomplet');
      expect(smtp.detail).toContain('seule la signature présentielle fonctionne');
    });

    it('configure quand host/port/from sont tous renseignés', () => {
      const rows = [row('smtp', 'host', 'smtp.exemple.fr'), row('smtp', 'port', '587'), row('smtp', 'from', 'it@exemple.fr')];
      const smtp = computeConfigHealth(rows).find((s) => s.key === 'smtp')!;
      expect(smtp.state).toBe('configure');
    });
  });

  // ─── smb (interrupteur + champ indispensable) ──────────────────────────────

  describe('smb', () => {
    it('desactive quand enabled=false', () => {
      const rows = [row('smb', 'enabled', 'false'), row('smb', 'path', '\\\\srv\\partage')];
      const smb = computeConfigHealth(rows).find((s) => s.key === 'smb')!;
      expect(smb.state).toBe('desactive');
    });

    it('incomplet quand activé sans chemin', () => {
      const rows = [row('smb', 'enabled', 'true')];
      const smb = computeConfigHealth(rows).find((s) => s.key === 'smb')!;
      expect(smb.state).toBe('incomplet');
      expect(smb.detail).toContain('chemin');
    });

    it('configure quand activé avec un chemin', () => {
      const rows = [row('smb', 'enabled', 'true'), row('smb', 'path', '\\\\srv\\partage')];
      const smb = computeConfigHealth(rows).find((s) => s.key === 'smb')!;
      expect(smb.state).toBe('configure');
    });
  });

  // ─── rappels / retention (interrupteur, aucun champ indispensable) ─────────

  describe('rappels et retention (défauts sûrs)', () => {
    it('rappels: configure dès que activé, même sans délais personnalisés', () => {
      const rappels = computeConfigHealth([row('rappels', 'enabled', 'true')]).find((s) => s.key === 'rappels')!;
      expect(rappels.state).toBe('configure');
    });

    it('rappels: desactive quand explicitement coupé', () => {
      const rappels = computeConfigHealth([row('rappels', 'enabled', 'false')]).find((s) => s.key === 'rappels')!;
      expect(rappels.state).toBe('desactive');
    });

    it('retention: configure dès que activée, même sans durées personnalisées', () => {
      const retention = computeConfigHealth([row('retention', 'enabled', 'true')]).find((s) => s.key === 'retention')!;
      expect(retention.state).toBe('configure');
    });
  });

  // ─── timestamp (interrupteur + champ indispensable) ────────────────────────

  describe('timestamp', () => {
    it('incomplet quand activé sans URL de TSA (le service ignore silencieusement l\'horodatage)', () => {
      const timestamp = computeConfigHealth([row('timestamp', 'enabled', 'true')]).find((s) => s.key === 'timestamp')!;
      expect(timestamp.state).toBe('incomplet');
    });

    it('configure quand activé avec une URL de TSA', () => {
      const rows = [row('timestamp', 'enabled', 'true'), row('timestamp', 'tsa_url', 'https://freetsa.org/tsr')];
      const timestamp = computeConfigHealth(rows).find((s) => s.key === 'timestamp')!;
      expect(timestamp.state).toBe('configure');
    });
  });

  // ─── tokens (toujours fonctionnel : repli sûr) ─────────────────────────────

  describe('tokens', () => {
    it('configure même sans aucune valeur renseignée (repli 7 jours)', () => {
      const tokens = computeConfigHealth([]).find((s) => s.key === 'tokens')!;
      expect(tokens.state).toBe('configure');
      expect(tokens.detail).toContain('7 jour');
    });

    it('configure avec la valeur personnalisée dans le détail', () => {
      const tokens = computeConfigHealth([row('tokens', 'expiry_days', '15')]).find((s) => s.key === 'tokens')!;
      expect(tokens.state).toBe('configure');
      expect(tokens.detail).toContain('15');
    });
  });
});
