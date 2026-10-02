import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveList, type ListColumn } from '@/components/list';
import { ROLE_LABELS } from '@/domain/labels';
import { formatTime } from '@/lib/dates';
import type { User, UserRole } from '@/types';
import type { UserRow } from './types';
import { UserActionsCell, type UserActionsCellProps } from './UserActionsCell';
import { accountOrigin } from './account-origin';

const ASSIGNABLE_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

const ORIGIN_LABELS = { manual: 'Créé manuellement', local: 'Compte local', directory: null } as const;

export interface UsersTableProps extends Omit<UserActionsCellProps, 'user'> {
  readonly users: readonly UserRow[];
  readonly isAdmin: boolean;
  readonly updatingRoleId: string | null;
  readonly onRoleChange: (user: User, role: UserRole) => void;
}

function NameCell({ user }: { user: User }) {
  const origin = ORIGIN_LABELS[accountOrigin(user)];
  return (
    <span className="flex flex-wrap items-center gap-2 font-medium">
      <span>{user.displayName}</span>
      {origin && <Badge variant="outline">{origin}</Badge>}
    </span>
  );
}

function RoleCell({ user, isAdmin, currentUserId, updatingRoleId, onRoleChange }: Pick<
  UsersTableProps, 'isAdmin' | 'currentUserId' | 'updatingRoleId' | 'onRoleChange'
> & { user: User }) {
  if (!isAdmin) {
    return <Badge variant={user.isItStaff ? 'default' : 'outline'}>{ROLE_LABELS[user.role]}</Badge>;
  }
  return (
    <div className="space-y-1">
      <Select
        value={user.role}
        onValueChange={(value) => onRoleChange(user, value as UserRole)}
        disabled={user.id === currentUserId || updatingRoleId === user.id}
      >
        <SelectTrigger className="h-11 w-full sm:h-8 sm:w-40" aria-label={`Rôle de ${user.displayName}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ASSIGNABLE_ROLES.map((role) => (
            <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {accountOrigin(user) === 'directory' && (
        <p className="text-xs text-muted-foreground">
          Compte SSO : rôle recalculé depuis les groupes Entra à la prochaine connexion
        </p>
      )}
    </div>
  );
}

/** État du compte ; un compte local verrouillé dit jusqu'à quand (heure de
 *  Paris), comme la connexion l'applique. */
function StatusCell({ user }: { user: UserRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant={user.active ? 'success' : 'error'}>{user.active ? 'Actif' : 'Inactif'}</Badge>
      {user.lockedUntil && <Badge variant="warning">{`Verrouillé jusqu'à ${formatTime(user.lockedUntil)}`}</Badge>}
    </span>
  );
}

/**
 * Comptes de l'écran Utilisateurs : un tableau sur ordinateur, des cartes sur
 * téléphone. Rôle modifiable par l'administrateur (sauf le sien), état du
 * compte, et actions selon l'origine du compte.
 */
export function UsersTable(props: UsersTableProps) {
  const { users, isAdmin } = props;
  const columns: ListColumn<UserRow>[] = [
    { key: 'name', header: 'Nom', card: 'title', cell: (u) => <NameCell user={u} /> },
    { key: 'email', header: 'Email', card: 'subtitle', cell: (u) => u.email || '—', className: 'text-muted-foreground' },
    { key: 'department', header: 'Service', cell: (u) => u.department || '—', className: 'text-muted-foreground' },
    { key: 'filiale', header: 'Filiale', cell: (u) => u.filiale?.displayName || u.company || '—' },
    { key: 'role', header: 'Rôle', cell: (u) => <RoleCell user={u} {...props} /> },
    {
      key: 'status',
      header: 'État',
      cell: (u) => <StatusCell user={u} />,
    },
    ...(isAdmin
      ? [{ key: 'actions', header: 'Actions', card: 'actions' as const, cell: (u: UserRow) => <UserActionsCell user={u} {...props} /> }]
      : []),
  ];
  return <ResponsiveList items={users} columns={columns} getKey={(u) => u.id} caption="Liste des utilisateurs" />;
}
