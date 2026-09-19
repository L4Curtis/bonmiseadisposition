import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { getActiveFiliales } from '@/hooks/use-active-filiales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Filiale, User } from '@/types';

const NO_FILIALE = '__none__';

interface ManualUserDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Présent en modification, absent en création. */
  readonly editUser?: User | null;
  readonly onSaved: (user: User) => void;
}

/** Sépare un displayName "Prénom NOM" en ses deux parties — filet de sécurité
 *  pour préremplir le formulaire : l'API ne renvoie jamais firstName/lastName
 *  séparément (seul displayName est stocké/retourné pour un compte manuel).
 *  Coupe sur le DERNIER espace, comme côté serveur (splitManualDisplayName) :
 *  correct pour un prénom composé ("Anne Marie DUPONT"), pas pour un nom de
 *  famille à plusieurs mots ("Jean VAN DER BERG"), cas volontairement non
 *  géré ici comme côté serveur. */
function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, lastSpace), lastName: trimmed.slice(lastSpace + 1) };
}

/** Boîte de dialogue de création OU modification d'un collaborateur créé
 *  manuellement (compagnon de chantier sans compte Active Directory). Les
 *  comptes d'annuaire ne passent jamais par ce composant : ils se modifient
 *  dans Active Directory. */
export function ManualUserDialog({ open, onOpenChange, editUser, onSaved }: ManualUserDialogProps) {
  const isEditing = Boolean(editUser);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [filialeId, setFilialeId] = useState('');
  const [filiales, setFiliales] = useState<Filiale[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editUser) {
      const fallback = splitDisplayName(editUser.displayName);
      setFirstName(editUser.firstName ?? fallback.firstName);
      setLastName(editUser.lastName ?? fallback.lastName);
      setEmail(editUser.email ?? '');
      setDepartment(editUser.department ?? '');
      setFilialeId(editUser.filialeId ?? '');
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setDepartment('');
      setFilialeId('');
    }
    setError('');
    // Mutualisé/mis en cache 60 s via useActiveFiliales : ré-ouvrir le
    // dialogue plusieurs fois de suite ne redemande pas la liste à chaque fois.
    getActiveFiliales().then(setFiliales).catch(() => setFiliales([]));
  }, [open, editUser]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Le contenu du dialogue est rendu dans un portail : dans l'arbre React il
    // reste un enfant du formulaire de création de bon, et sans cet arrêt la
    // soumission du dialogue déclenche AUSSI celle du formulaire parent
    // (« Sélectionnez un collaborateur » alors que la création est en cours).
    e.stopPropagation();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    if (!trimmedFirstName || !trimmedLastName) {
      setError('Le prénom et le nom sont obligatoires.');
      return;
    }
    setError('');
    setSaving(true);
    const payload = {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      // Chaîne vide acceptée par l'API : "pas d'email" à la création, email
      // retiré à la modification (seule façon de le vider) — idem department.
      email: email.trim(),
      department: department.trim(),
      // filialeId est un UUID côté validation serveur : une chaîne vide y
      // échouerait, contrairement à email/department — clé omise si vide.
      ...(filialeId ? { filialeId } : {}),
    };
    try {
      const saved = isEditing && editUser
        ? await api.patch<User>(`/users/${editUser.id}/manual`, payload)
        : await api.post<User>('/users/manual', payload);
      onSaved(saved);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(errorMessage(
        err,
        isEditing ? 'Erreur lors de la modification du collaborateur' : 'Erreur lors de la création du collaborateur',
      ));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Modifier le collaborateur' : 'Ajouter un collaborateur'}</DialogTitle>
            <DialogDescription>
              Pour un compagnon de chantier sans compte Active Directory. Sans adresse email, il signe ses bons en
              présentiel.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="manual-user-first-name">Prénom *</Label>
              <Input
                id="manual-user-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-user-last-name">Nom *</Label>
              <Input id="manual-user-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="manual-user-email">Email (facultatif)</Label>
              <Input id="manual-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Sans adresse email, ce collaborateur signera ses bons en présentiel.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-user-department">Service (facultatif)</Label>
              <Input
                id="manual-user-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-user-filiale">Filiale (facultative)</Label>
              <Select value={filialeId || NO_FILIALE} onValueChange={(v) => setFilialeId(v === NO_FILIALE ? '' : v)}>
                <SelectTrigger id="manual-user-filiale">
                  <SelectValue placeholder="Aucune" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FILIALE}>Aucune</SelectItem>
                  {filiales.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
