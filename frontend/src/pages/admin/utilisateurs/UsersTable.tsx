import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLE_LABELS } from '@/domain/labels';
import type { User, UserRole } from '@/types';
import { UserActionsCell } from './UserActionsCell';

const ASSIGNABLE_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

interface UsersTableProps {
  readonly users: User[];
  readonly loading: boolean;
  readonly loadError: string | null;
  readonly isAdmin: boolean;
  readonly isSearching: boolean;
  readonly currentUserId?: string;
  readonly updatingRoleId: string | null;
  readonly onRoleChange: (user: User, role: UserRole) => void;
  readonly unlockingId: string | null;
  readonly onUnlock: (user: User) => void;
  readonly onEdit: (user: User) => void;
  readonly togglingActiveId: string | null;
  readonly onToggleActive: (user: User) => void;
}

/** Table de l'annuaire des utilisateurs : rôle (admin), statut, badge
 *  « Créé manuellement » et actions (déverrouillage, modification/activation
 *  réservées aux comptes manuels). */
export function UsersTable({
  users, loading, loadError, isAdmin, isSearching, currentUserId,
  updatingRoleId, onRoleChange, unlockingId, onUnlock, onEdit, togglingActiveId, onToggleActive,
}: UsersTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm" aria-label="Liste des utilisateurs">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nom</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Service</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Filiale</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
              {isAdmin && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="px-4 py-2"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-4 w-40" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="px-4 py-2"><Skeleton className="h-5 w-12 rounded-full" /></td>
                  {isAdmin && <td className="px-4 py-2"><Skeleton className="h-8 w-24" /></td>}
                </tr>
              ))
            ) : users.length === 0 && !loadError ? (
              <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground/70">
                {isSearching ? 'Aucun resultat' : 'Aucun utilisateur (sync LDAP requise)'}
              </td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    <span>{u.displayName}</span>
                    {u.isManualAccount && <Badge variant="outline">Créé manuellement</Badge>}
                  </div>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{u.email || '—'}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.department || '—'}</td>
                <td className="px-4 py-2">{u.filiale?.displayName || u.company || '—'}</td>
                <td className="px-4 py-2">
                  {isAdmin ? (
                    <div className="space-y-1">
                      <Select
                        value={u.role}
                        onValueChange={(value) => onRoleChange(u, value as UserRole)}
                        disabled={u.id === currentUserId || updatingRoleId === u.id}
                      >
                        <SelectTrigger className="h-8 w-40" aria-label={`Rôle de ${u.displayName}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!u.isLocalAccount && !u.isManualAccount && (
                        <p className="text-[11px] text-muted-foreground/70">
                          Compte SSO : rôle recalculé depuis les groupes Entra à la prochaine connexion
                        </p>
                      )}
                    </div>
                  ) : (
                    <Badge variant={u.isItStaff ? 'default' : 'outline'}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={u.active ? 'success' : 'error'}>
                    {u.active ? 'Actif' : 'Inactif'}
                  </Badge>
                </td>
                {isAdmin && (
                  <td className="px-4 py-2">
                    <UserActionsCell
                      user={u}
                      unlockingId={unlockingId}
                      onUnlock={onUnlock}
                      onEdit={onEdit}
                      togglingActiveId={togglingActiveId}
                      onToggleActive={onToggleActive}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
