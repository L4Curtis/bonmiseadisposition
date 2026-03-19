import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
      <h1 className="text-xl font-bold text-slate-900">Utilisateurs</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Rechercher par nom, email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Nom</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Service</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Filiale</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Rôle</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Chargement...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {query.length >= 2 ? 'Aucun résultat' : 'Aucun utilisateur (sync LDAP requise)'}
                </td></tr>
              ) : users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{u.displayName}</td>
                  <td className="px-4 py-2 text-slate-500">{u.email}</td>
                  <td className="px-4 py-2 text-slate-500">{u.department || '—'}</td>
                  <td className="px-4 py-2">{u.filiale?.displayName || u.company || '—'}</td>
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
