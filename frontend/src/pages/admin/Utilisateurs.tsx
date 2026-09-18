import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Search, ChevronLeft, ChevronRight, UserPlus, XCircle } from 'lucide-react';
import type { User, UserRole } from '@/types';
import { ManualUserDialog } from './utilisateurs/ManualUserDialog';
import { UsersTable } from './utilisateurs/UsersTable';

const LIMIT = 25;

interface UsersPage {
  users: User[];
  total: number;
}

export function UtilisateursPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  // Identifie la requête la plus récente : une réponse arrivée après qu'une
  // requête plus récente a été lancée (frappe rapide ou changement de page) est ignorée.
  const requestIdRef = useRef(0);
  const isSearching = query.trim().length >= 2;

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);

    const q = query.trim();
    const request: Promise<UsersPage> = q.length >= 2
      ? api.get<User[]>(`/users/search?q=${encodeURIComponent(q)}`).then((data) => ({ users: data, total: data.length }))
      : api.get<{ users: User[]; total: number; page: number; limit: number } | User[]>(`/users?page=${page}&limit=${LIMIT}`)
        .then((data) => (Array.isArray(data) ? { users: data, total: data.length } : { users: data.users, total: data.total }));

    request
      .then(({ users: fetchedUsers, total: fetchedTotal }) => {
        if (requestIdRef.current !== requestId) return;
        setUsers(fetchedUsers);
        setTotal(fetchedTotal);
      })
      .catch((e: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setUsers([]);
        setTotal(0);
        setLoadError(errorMessage(e, 'Erreur lors du chargement des utilisateurs'));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [query, page]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    // clearTimeout annule le débounce s'il n'a pas encore déclenché load() ;
    // si une requête est déjà en vol, invalider requestIdRef évite un setState
    // après démontage (ou une réponse obsolète appliquée après un nouveau load()).
    return () => {
      clearTimeout(t);
      requestIdRef.current += 1;
    };
  }, [load]);

  // Une nouvelle recherche repart de la page 1
  useEffect(() => { setPage(1); }, [query]);

  const handleUnlock = async (u: User) => {
    setUnlockingId(u.id);
    try {
      const res = await api.post<{ unlocked: boolean; removed: number }>(`/admin/users/${u.id}/unlock`);
      toast({
        title: res.unlocked ? 'Compte déverrouillé' : 'Compte non verrouillé',
        description: `${res.removed} tentative(s) échouée(s) supprimée(s).`,
        variant: 'success',
      });
    } catch (e: unknown) {
      showActionError(e, 'Erreur lors du déverrouillage');
    } finally {
      setUnlockingId(null);
    }
  };

  const handleRoleChange = async (target: User, role: UserRole) => {
    if (role === target.role) return;
    const previousRole = target.role;
    const previousIsItStaff = target.isItStaff;

    setUpdatingRoleId(target.id);
    // Mise à jour optimiste (immutable) — revert en cas d'échec serveur.
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role } : u)));

    try {
      const result = await api.patch<{ id: string; role: UserRole; isItStaff: boolean }>(
        `/admin/users/${target.id}/role`,
        { role },
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, role: result.role, isItStaff: result.isItStaff } : u)),
      );
      toast({ title: 'Rôle mis à jour', variant: 'success' });
    } catch (e: unknown) {
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, role: previousRole, isItStaff: previousIsItStaff } : u)),
      );
      showActionError(e, 'Erreur lors de la mise à jour du rôle');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleToggleActive = async (target: User) => {
    const nextActive = !target.active;
    setTogglingActiveId(target.id);
    // Mise à jour optimiste (immutable) — revert en cas d'échec serveur.
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, active: nextActive } : u)));

    try {
      await api.patch<User>(`/users/${target.id}/manual`, { active: nextActive });
      toast({ title: nextActive ? 'Collaborateur activé' : 'Collaborateur désactivé', variant: 'success' });
    } catch (e: unknown) {
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, active: target.active } : u)));
      showActionError(e, 'Erreur lors de la mise à jour du statut');
    } finally {
      setTogglingActiveId(null);
    }
  };

  const handleOpenCreate = () => {
    setEditTarget(null);
    setManualDialogOpen(true);
  };

  const handleOpenEdit = (target: User) => {
    setEditTarget(target);
    setManualDialogOpen(true);
  };

  const handleManualUserSaved = () => {
    toast({ title: editTarget ? 'Collaborateur modifié' : 'Collaborateur créé', variant: 'success' });
    load();
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Utilisateurs</h1>
        {isAdmin && (
          <Button onClick={handleOpenCreate} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Ajouter un collaborateur
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
        <Input
          placeholder="Rechercher par nom, email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loadError && !loading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center" role="alert">
          <XCircle className="h-6 w-6 mx-auto mb-2 text-destructive" />
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>
            Réessayer
          </Button>
        </div>
      )}

      <UsersTable
        users={users}
        loading={loading}
        loadError={loadError}
        isAdmin={isAdmin}
        isSearching={isSearching}
        currentUserId={currentUser?.id}
        updatingRoleId={updatingRoleId}
        onRoleChange={handleRoleChange}
        unlockingId={unlockingId}
        onUnlock={handleUnlock}
        onEdit={handleOpenEdit}
        togglingActiveId={togglingActiveId}
        onToggleActive={handleToggleActive}
      />

      {!isSearching && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} utilisateur(s)</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3">Page {page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {isAdmin && (
        <ManualUserDialog
          open={manualDialogOpen}
          onOpenChange={setManualDialogOpen}
          editUser={editTarget}
          onSaved={handleManualUserSaved}
        />
      )}
    </div>
  );
}
