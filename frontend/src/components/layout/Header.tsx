import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User, KeyRound, X } from 'lucide-react';

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    if (form.next.length < 6) { setError('Minimum 6 caractères'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
        credentials: 'include',
      });
      if (res.ok) { setSuccess(true); }
      else { const d = await res.json(); setError(d.message || 'Erreur'); }
    } catch { setError('Erreur serveur'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Changer le mot de passe</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        {success ? (
          <div className="text-center py-4">
            <p className="text-green-600 font-medium">Mot de passe modifié ✓</p>
            <button onClick={onClose} className="mt-3 text-sm text-slate-500 underline">Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}
            {['current', 'next', 'confirm'].map((field) => (
              <div key={field}>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {field === 'current' ? 'Mot de passe actuel' : field === 'next' ? 'Nouveau mot de passe' : 'Confirmer'}
                </label>
                <input
                  type="password"
                  value={form[field as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  required
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const [showChangePwd, setShowChangePwd] = useState(false);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <div />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <User className="h-4 w-4" />
            <span>{user?.email}</span>
            {(user as any)?.isLocalAccount && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">local</span>
            )}
          </div>
          {(user as any)?.isLocalAccount && (
            <button
              onClick={() => setShowChangePwd(true)}
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <KeyRound className="h-4 w-4" />
              Mot de passe
            </button>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </header>
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </>
  );
}
