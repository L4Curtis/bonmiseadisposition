import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { validate, changePasswordSchema } from '@/lib/validation';

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClose = (v: boolean) => {
    if (!v) {
      setForm({ current: '', next: '', confirm: '' });
      setError('');
      setSuccess(false);
    }
    onOpenChange(v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(changePasswordSchema, {
      currentPassword: form.current,
      newPassword: form.next,
      confirmPassword: form.confirm,
    });
    if (!result.success) {
      setError(Object.values(result.errors)[0] ?? 'Formulaire invalide');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/change-password', {
        currentPassword: result.data.currentPassword,
        newPassword: result.data.newPassword,
      });
      setSuccess(true);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Erreur lors du changement de mot de passe'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Changer le mot de passe</DialogTitle>
        </DialogHeader>
        {success ? (
          <div className="text-center py-4" aria-live="polite">
            <p className="text-green-600 font-medium">Mot de passe modifié avec succès</p>
            <Button variant="ghost" size="sm" onClick={() => handleClose(false)} className="mt-3">
              Fermer
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="current-pwd">Mot de passe actuel</Label>
              <Input
                id="current-pwd"
                type="password"
                value={form.current}
                onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
              <Input
                id="new-pwd"
                type="password"
                value={form.next}
                onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pwd">Confirmer</Label>
              <Input
                id="confirm-pwd"
                type="password"
                value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
