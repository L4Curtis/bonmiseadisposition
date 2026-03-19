import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type TestResult = { success: boolean; message: string } | null;

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  type?: string;
  encrypted?: boolean;
  toggle?: boolean;
  defaultValue?: string;
};

// ── Toggle switch ──────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ── Test button ────────────────────────────────────────────────
function TestButton({ onTest, label }: { onTest: () => Promise<TestResult>; label: string }) {
  const [result, setResult] = useState<TestResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult(null);
    const res = await onTest();
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {label}
      </Button>
      {result && (
        <span className={`flex items-center gap-1 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
          {result.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}

// ── Email test button (avec champ adresse) ─────────────────────
function SmtpTestButton({ onTest }: { onTest: (email: string) => Promise<TestResult> }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<TestResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!email) return;
    setLoading(true);
    setResult(null);
    const res = await onTest(email);
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <p className="text-xs font-medium text-slate-600">Envoyer un email de test</p>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          placeholder="adresse@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-xs h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={loading || !email}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Envoyer le test
        </Button>
      </div>
      {result && (
        <span className={`flex items-center gap-1 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
          {result.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}

// ── Config section ─────────────────────────────────────────────
function ConfigSection({
  title,
  category,
  fields,
  onTest,
  testLabel,
  footer,
}: {
  title: string;
  category: string;
  fields: FieldDef[];
  onTest?: () => Promise<TestResult>;
  testLabel?: string;
  footer?: React.ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Record<string, string>>(`/admin/config/${category}`).then((data) => {
      const masked: Record<string, string> = {};
      for (const f of fields) {
        const raw = data[f.key];
        if (f.encrypted && raw) {
          masked[f.key] = '••••••••';
        } else {
          masked[f.key] = raw || f.defaultValue || '';
        }
      }
      setValues(masked);
    });
  }, [category]);

  const save = async () => {
    setSaving(true);
    const toSave: Record<string, string> = {};
    for (const f of fields) {
      if (values[f.key] !== '••••••••') {
        toSave[f.key] = values[f.key] || '';
      }
    }
    await api.put(`/admin/config/${category}`, toSave);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleFields = fields.filter((f) => f.toggle);
  const inputFields = fields.filter((f) => !f.toggle);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle fields */}
        {toggleFields.length > 0 && (
          <div className="flex flex-wrap gap-6 pb-2">
            {toggleFields.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <Toggle
                  checked={values[f.key] === 'true'}
                  onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v ? 'true' : 'false' }))}
                />
                <Label className="cursor-pointer select-none">{f.label}</Label>
              </div>
            ))}
          </div>
        )}

        {/* Input fields */}
        {inputFields.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inputFields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  value={values[f.key] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onFocus={(e) => {
                    if (f.encrypted && e.target.value === '••••••••') {
                      setValues((v) => ({ ...v, [f.key]: '' }));
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {saved ? 'Enregistré ✓' : 'Enregistrer'}
          </Button>
          {onTest && testLabel && (
            <TestButton onTest={onTest} label={testLabel} />
          )}
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}

export function ConfigurationPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Configuration système</h1>

      <ConfigSection
        title="Paramètres généraux"
        category="general"
        fields={[
          { key: 'local_auth_enabled', label: 'Connexion locale activée', toggle: true, defaultValue: 'true' },
        ]}
      />

      <ConfigSection
        title="LDAP / Active Directory"
        category="ldap"
        onTest={() => api.post<TestResult>('/admin/config/test/ldap')}
        testLabel="Tester la connexion LDAP"
        fields={[
          { key: 'enabled', label: 'LDAP activé', toggle: true },
          { key: 'use_ssl', label: 'SSL/TLS', toggle: true },
          { key: 'url', label: 'URL LDAP', placeholder: 'ldaps://dc.entreprise.local:636' },
          { key: 'bind_dn', label: 'Bind DN', placeholder: 'CN=svc-ldap,OU=Services,DC=...' },
          { key: 'bind_password', label: 'Mot de passe', type: 'password', encrypted: true },
          { key: 'search_base', label: 'Search Base', placeholder: 'DC=entreprise,DC=local' },
          { key: 'user_filter', label: 'Filtre utilisateurs', placeholder: '(objectClass=person)' },
          { key: 'sync_interval_hours', label: 'Fréquence sync (heures)', placeholder: '6' },
        ]}
      />

      <ConfigSection
        title="Microsoft Entra ID (SSO)"
        category="entra"
        onTest={() => api.post<TestResult>('/admin/config/test/entra')}
        testLabel="Tester la connexion Entra"
        fields={[
          { key: 'tenant_id', label: 'Tenant ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
          { key: 'client_id', label: 'Client ID (App Registration)', placeholder: 'xxxxxxxx-...' },
          { key: 'client_secret', label: 'Client Secret', type: 'password', encrypted: true },
          { key: 'redirect_uri', label: 'Redirect URI', placeholder: 'https://bons.entreprise.local/api/auth/callback' },
          { key: 'admin_group_id', label: 'Groupe Admin (Object ID)', placeholder: 'xxxxxxxx-...' },
          { key: 'technician_group_id', label: 'Groupe Technicien (Object ID)', placeholder: 'xxxxxxxx-...' },
        ]}
      />

      <ConfigSection
        title="Email / SMTP"
        category="smtp"
        fields={[
          { key: 'secure', label: 'TLS/SSL', toggle: true },
          { key: 'host', label: 'Serveur SMTP', placeholder: 'smtp.entreprise.local' },
          { key: 'port', label: 'Port', placeholder: '587' },
          { key: 'user', label: 'Utilisateur SMTP', placeholder: 'notifications@entreprise.local' },
          { key: 'password', label: 'Mot de passe SMTP', type: 'password', encrypted: true },
          { key: 'from', label: 'Adresse From', placeholder: 'IT <noreply@entreprise.local>' },
        ]}
        footer={
          <SmtpTestButton
            onTest={(email) =>
              api.post<TestResult>('/admin/config/test/smtp', { testEmail: email })
            }
          />
        }
      />

      <ConfigSection
        title="Rappels automatiques"
        category="rappels"
        fields={[
          { key: 'enabled', label: 'Activé', toggle: true },
          { key: 'delay_1', label: '1er rappel (jours)', placeholder: '3' },
          { key: 'delay_2', label: '2ème rappel (jours)', placeholder: '7' },
          { key: 'delay_3', label: '3ème rappel (jours)', placeholder: '14' },
        ]}
      />

      <ConfigSection
        title="Tokens de signature"
        category="tokens"
        fields={[
          { key: 'expiry_days', label: 'Expiration (jours)', placeholder: '30' },
        ]}
      />

      <ConfigSection
        title="Export SMB (Partage réseau)"
        category="smb"
        onTest={() => api.post<TestResult>('/admin/config/test/smb')}
        testLabel="Tester la connexion SMB"
        fields={[
          { key: 'enabled', label: 'Export SMB activé', toggle: true },
          { key: 'path', label: 'Chemin UNC ou local', placeholder: '\\\\serveur\\partage\\bons' },
          { key: 'username', label: 'Utilisateur', placeholder: 'DOMAINE\\utilisateur' },
          { key: 'password', label: 'Mot de passe', type: 'password', encrypted: true },
          { key: 'domain', label: 'Domaine', placeholder: 'ENTREPRISE' },
        ]}
      />
    </div>
  );
}
