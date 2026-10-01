import { useState } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ListState, Pagination } from '@/components/list';
import { toast } from '@/hooks/use-toast';
import type { UserStatusFilter } from '@/contracts/users';
import type { User } from '@/types';
import { ManualUserDialog } from './utilisateurs/ManualUserDialog';
import { UsersTable } from './utilisateurs/UsersTable';
import { ManualUsersActionsBar } from './utilisateurs/ManualUsersActionsBar';
import { ManualUsersImportDialog } from './utilisateurs/ManualUsersImportDialog';
import { DeactivateUserDialog } from './utilisateurs/DeactivateUserDialog';
import { useManualUsersImport } from './utilisateurs/useManualUsersImport';
import { useManualUsersTemplate } from './utilisateurs/useManualUsersTemplate';
import { ManualUsersExportButton } from './utilisateurs/ManualUsersExportButton';
import { useUsersList } from './utilisateurs/useUsersList';
import { useUserAccountActions } from './utilisateurs/useUserAccountActions';

const STATUS_OPTIONS: readonly { value: UserStatusFilter; label: string }[] = [
  { value: 'active', label: 'Comptes actifs' },
  { value: 'inactive', label: 'Comptes désactivés' },
  { value: 'all', label: 'Tous les comptes' },
];

function isStatusFilter(value: string): value is UserStatusFilter {
  return STATUS_OPTIONS.some((option) => option.value === value);
}

export function UtilisateursPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const list = useUsersList();
  const actions = useUserAccountActions(list);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const importState = useManualUsersImport(list.reload);
  const template = useManualUsersTemplate();

  const openManualDialog = (target: User | null) => {
    setEditTarget(target);
    setManualDialogOpen(true);
  };

  const handleManualUserSaved = () => {
    toast({ title: editTarget ? 'Collaborateur modifié' : 'Collaborateur créé', variant: 'success' });
    list.reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Utilisateurs</h1>
        {isAdmin && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ManualUsersExportButton />
            <ManualUsersActionsBar
              onAdd={() => openManualDialog(null)}
              onImport={importState.openDialog}
              onDownloadTemplate={() => void template.downloadTemplate()}
              busy={template.downloadingTemplate}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
          <Input
            placeholder="Rechercher par nom, email, identifiant…"
            aria-label="Rechercher un utilisateur"
            value={list.searchInput}
            onChange={(e) => list.setSearchInput(e.target.value)}
            className="h-11 pl-9 sm:h-10"
          />
        </div>
        <select
          aria-label="État des comptes"
          value={list.status}
          onChange={(e) => { if (isStatusFilter(e.target.value)) list.setStatus(e.target.value); }}
          className="h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
        >
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      {isAdmin && !list.directoryActive && (
        <p className="text-sm text-muted-foreground">
          L'annuaire Active Directory n'est pas synchronisé : vous pouvez désactiver ici le compte d'une personne
          qui quitte l'entreprise.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <ListState
            loading={list.loading}
            error={list.loadError}
            isEmpty={list.users.length === 0}
            onRetry={list.reload}
            emptyMessage="Aucun utilisateur"
            hasActiveFilters={list.hasActiveFilters}
            onClearFilters={list.clearFilters}
          >
            <UsersTable
              users={list.users}
              isAdmin={isAdmin}
              currentUserId={currentUser?.id}
              directoryActive={list.directoryActive}
              updatingRoleId={actions.updatingRoleId}
              onRoleChange={(u, role) => void actions.changeRole(u, role)}
              unlockingId={actions.unlockingId}
              onUnlock={(u) => void actions.unlock(u)}
              onEdit={openManualDialog}
              togglingActiveId={actions.togglingActiveId}
              onToggleActive={actions.toggleActive}
            />
          </ListState>
        </CardContent>
      </Card>

      <Pagination
        page={list.pagination.page}
        pageSize={list.pagination.pageSize}
        total={list.total}
        onPageChange={list.pagination.setPage}
        onPageSizeChange={list.pagination.setPageSize}
        itemLabel={{ singular: 'utilisateur', plural: 'utilisateurs' }}
      />

      {isAdmin && (
        <>
          <ManualUserDialog
            open={manualDialogOpen}
            onOpenChange={setManualDialogOpen}
            editUser={editTarget}
            onSaved={handleManualUserSaved}
          />
          <ManualUsersImportDialog state={importState} />
          <DeactivateUserDialog
            target={actions.deactivateTarget}
            onCancel={() => actions.setDeactivateTarget(null)}
            onConfirm={() => void actions.confirmDeactivate()}
            loading={actions.deactivateTarget !== null && actions.togglingActiveId === actions.deactivateTarget.id}
          />
        </>
      )}
    </div>
  );
}
