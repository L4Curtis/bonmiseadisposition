import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import type { User } from '@/types';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  technician: 'Technicien',
  collaborator: 'Collaborateur',
};

export function UtilisateursPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const search = async (q: string) => {
    setLoading(true);
    const data = q.length >= 2
      ? await api.get<User[]>(`/users/search?q=${encodeURIComponent(q)}`)
      : await api.get<User[]>('/users');
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query]);

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
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground/70">
                  {query.length >= 2 ? 'Aucun resultat' : 'Aucun utilisateur (sync LDAP requise)'}
                </td></tr>
              ) : users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">{u.displayName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.department || '\u2014'}</td>
                  <td className="px-4 py-2">{u.filiale?.displayName || u.company || '\u2014'}</td>
                  <td className="px-4 py-2">
                    <Badge variant={u.isItStaff ? 'default' : 'outline'}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={u.active ? 'success' : 'error'}>
                      {u.active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
