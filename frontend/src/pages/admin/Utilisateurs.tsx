import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { errorMessage, showActionError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { ROLE_LABELS } from '@/lib/labels';
import { Search, ChevronLeft, ChevronRight, LockOpen, XCircle } from 'lucide-react';
import type { User, UserRole } from '@/types';

const ASSIGNABLE_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

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

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Utilisateurs</h1>

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
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-center" role="alert">
          <XCircle className="h-6 w-6 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>
            Réessayer
          </Button>
        </div>
      )}

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
                  <td className="px-4 py-2 font-medium">{u.displayName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.department || '—'}</td>
                  <td className="px-4 py-2">{u.filiale?.displayName || u.company || '—'}</td>
                  <td className="px-4 py-2">
                    {isAdmin ? (
                      <div className="space-y-1">
                        <Select
                          value={u.role}
                          onValueChange={(value) => handleRoleChange(u, value as UserRole)}
                          disabled={u.id === currentUser?.id || updatingRoleId === u.id}
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
                        {!u.isLocalAccount && (
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
                      {u.isLocalAccount && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={unlockingId === u.id}
                          onClick={() => handleUnlock(u)}
                          className="gap-1.5"
                        >
                          <LockOpen className="h-3.5 w-3.5" />
                          {unlockingId === u.id ? 'Déverrouillage...' : 'Déverrouiller'}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

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
    </div>
  );
}
