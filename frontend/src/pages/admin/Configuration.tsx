import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Loader2, Check, RefreshCw, AlertTriangle, HardDrive } from 'lucide-react';

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
        checked ? 'bg-blue-600' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform ${
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
        {loading ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : null}
        {label}
      </Button>
      {result && (
        <span
          className={`flex items-center gap-1 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}
          role={result.success ? undefined : 'alert'}
        >
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
      <p className="text-xs font-medium text-muted-foreground">Envoyer un email de test</p>
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
          {loading ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none mr-1" /> : null}
          Envoyer le test
        </Button>
      </div>
      {result && (
        <span
          className={`flex items-center gap-1 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}
          role={result.success ? undefined : 'alert'}
        >
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
  const [loaded, setLoaded] = useState(false);

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
      setLoaded(true);
    });
  }, [category]);

  const save = async () => {
    setSaving(true);
    try {
      const toSave: Record<string, string> = {};
      for (const f of fields) {
        if (values[f.key] !== '••••••••') {
          toSave[f.key] = values[f.key] || '';
        }
      }
      await api.put(`/admin/config/${category}`, toSave);
      toast({ title: 'Configuration enregistrée', variant: 'success' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleFields = fields.filter((f) => f.toggle);
  const inputFields = fields.filter((f) => !f.toggle);

  if (!loaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inputFields.map((f) => (
              <div key={f.key} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

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
          <Button
            onClick={save}
            disabled={saving || saved}
            size="sm"
            className={saved ? 'bg-green-600 hover:bg-green-600 text-white' : ''}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : saved ? <Check className="h-3 w-3" /> : null}
            {saved ? 'Enregistré' : 'Enregistrer'}
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
      <h1 className="text-xl font-bold text-foreground">Configuration système</h1>

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
          { key: 'path', label: 'Chemin UNC ou montage local', placeholder: '\\\\serveur\\partage\\bons ou /mnt/partage' },
          { key: 'username', label: 'Utilisateur', placeholder: 'DOMAINE\\utilisateur' },
          { key: 'password', label: 'Mot de passe', type: 'password', encrypted: true },
          { key: 'domain', label: 'Domaine', placeholder: 'ENTREPRISE' },
        ]}
        footer={
          <p className="text-xs text-muted-foreground mt-2">
            Sur Windows, les chemins UNC utilisent la session courante. Sur Docker, le partage doit être monté via mount.cifs ou volume.
          </p>
        }
      />

      <SmbMonitoringWidget />
    </div>
  );
}

// ── SMB Monitoring Widget ─────────────────────────────────────

interface SmbStatus {
  enabled: boolean;
  total?: number;
  success?: number;
  failed?: number;
  pending?: number;
  lastSuccessAt?: string | null;
}

interface SmbFailedExport {
  id: string;
  bonId: string;
  filename: string;
  errorMessage: string | null;
  retryCount: number;
  lastAttemptAt: string | null;
  createdAt: string;
  bonReference: string;
}

function SmbMonitoringWidget() {
  const [status, setStatus] = useState<SmbStatus | null>(null);
  const [failed, setFailed] = useState<SmbFailedExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.get<SmbStatus>('/admin/smb/status');
      setStatus(s);
      if (s.enabled && (s.failed ?? 0) > 0) {
        const f = await api.get<SmbFailedExport[]>('/admin/smb/failed');
        setFailed(f);
      } else {
        setFailed([]);
      }
    } catch {
      // Endpoint may not exist if backend not updated yet
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retryOne = async (id: string) => {
    setRetrying(id);
    try {
      await api.post(`/admin/smb/retry/${id}`);
      toast({ title: 'Export relancé', variant: 'success' });
      await load();
    } catch {
      toast({ title: 'Erreur lors du retry', variant: 'destructive' });
    } finally {
      setRetrying(null);
    }
  };

  const retryAll = async () => {
    setRetryingAll(true);
    try {
      const result = await api.post<{ retried: number; succeeded: number; failed: number }>('/admin/smb/retry-all');
      toast({
        title: `Retry terminé : ${result.succeeded} réussi(s), ${result.failed} échoué(s)`,
        variant: result.failed > 0 ? 'destructive' : 'success',
      });
      await load();
    } catch {
      toast({ title: 'Erreur lors du retry', variant: 'destructive' });
    } finally {
      setRetryingAll(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monitoring export SMB</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  if (!status || !status.enabled) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> Monitoring export SMB</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">L'export SMB est désactivé. Activez-le ci-dessus pour voir les statistiques.</p>
        </CardContent>
      </Card>
    );
  }

  const hasFailures = (status.failed ?? 0) > 0;
  const statusColor = hasFailures ? 'text-red-600' : 'text-green-600';
  const statusIcon = hasFailures ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" /> Monitoring export SMB
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status summary */}
        <div className="flex items-center gap-6 flex-wrap">
          <div className={`flex items-center gap-1.5 font-medium ${statusColor}`}>
            {statusIcon}
            {hasFailures ? `${status.failed} export(s) échoué(s)` : 'Tous les exports OK'}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Total : <strong className="text-foreground">{status.total ?? 0}</strong></span>
            <span>Réussis : <strong className="text-green-600">{status.success ?? 0}</strong></span>
            <span>Échoués : <strong className={hasFailures ? 'text-red-600' : 'text-foreground'}>{status.failed ?? 0}</strong></span>
            <span>En attente : <strong className="text-foreground">{status.pending ?? 0}</strong></span>
          </div>
        </div>

        {status.lastSuccessAt && (
          <p className="text-xs text-muted-foreground">
            Dernier export réussi : {new Date(status.lastSuccessAt).toLocaleString('fr-FR')}
          </p>
        )}

        {/* Failed exports list */}
        {failed.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Exports échoués</p>
              <Button
                variant="outline"
                size="sm"
                onClick={retryAll}
                disabled={retryingAll}
              >
                {retryingAll ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Tout réessayer
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Bon</th>
                    <th className="text-left px-3 py-2 font-medium">Fichier</th>
                    <th className="text-left px-3 py-2 font-medium">Erreur</th>
                    <th className="text-center px-3 py-2 font-medium">Tentatives</th>
                    <th className="text-right px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {failed.slice(0, 20).map((exp) => (
                    <tr key={exp.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{exp.bonReference}</td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={exp.filename}>{exp.filename}</td>
                      <td className="px-3 py-2 text-xs text-red-600 max-w-[250px] truncate" title={exp.errorMessage ?? ''}>
                        {exp.errorMessage ?? 'Erreur inconnue'}
                      </td>
                      <td className="px-3 py-2 text-center text-xs">{exp.retryCount}/3</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryOne(exp.id)}
                          disabled={retrying === exp.id}
                          className="h-7 px-2"
                        >
                          {retrying === exp.id
                            ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                            : <RefreshCw className="h-3 w-3" />}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {failed.length > 20 && (
              <p className="text-xs text-muted-foreground">
                {failed.length - 20} export(s) échoué(s) supplémentaire(s) non affiché(s).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
