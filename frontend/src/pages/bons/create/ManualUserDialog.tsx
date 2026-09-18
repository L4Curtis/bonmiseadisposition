import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Filiale } from '@/types';
import type { UserResult } from './types';

const NO_FILIALE = '__none__';

interface ManualUserDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Préremplit le nom avec la recherche déjà saisie (évite de la retaper). */
  readonly initialLastName?: string;
  readonly onCreated: (user: UserResult) => void;
}

/** Réponse de POST /api/users/manual — au minimum ces champs. */
interface ManualUserResponse {
  id: string;
  displayName: string;
  email: string | null;
  department?: string | null;
  isManualAccount: boolean;
}

/** Boîte de dialogue de création d'un collaborateur sans compte Active
 *  Directory (compagnon de chantier). Ouverte depuis l'autocomplétion quand
 *  la recherche ne donne aucun résultat. Sans adresse email, le collaborateur
 *  créé signera ses bons en présentiel — le champ le précise et reste
 *  facultatif, tout comme le service et la filiale. */
export function ManualUserDialog({ open, onOpenChange, initialLastName, onCreated }: ManualUserDialogProps) {
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
    setFirstName('');
    setLastName(initialLastName?.trim() ?? '');
    setEmail('');
    setDepartment('');
    setFilialeId('');
    setError('');
    api.get<Filiale[]>('/filiales/active').then(setFiliales).catch(() => setFiliales([]));
  }, [open, initialLastName]);

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
    try {
      const created = await api.post<ManualUserResponse>('/users/manual', {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        // Une chaîne vide est acceptée par l'API (traitée comme "pas
        // d'email"/"pas de service") : pas besoin d'omettre la clé.
        email: email.trim(),
        department: department.trim(),
        // filialeId est un UUID côté validation serveur : une chaîne vide y
        // échouerait, contrairement à email/department — clé omise si vide.
        ...(filialeId ? { filialeId } : {}),
      });
      onCreated({
        id: created.id,
        displayName: created.displayName,
        email: created.email,
        department: created.department,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Erreur lors de la création du collaborateur'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Créer un collaborateur</DialogTitle>
            <DialogDescription>
              Pour un compagnon de chantier sans compte Active Directory. Sans adresse email, il signera ce bon en
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
              {saving ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
