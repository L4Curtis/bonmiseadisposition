import { ApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

/** Message lisible pour l'utilisateur à partir d'une erreur inconnue. */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'Trop de requêtes, réessayez dans une minute.';
    return e.message || fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** Toast d'erreur uniforme : affiche le message backend quand il existe. */
export function showActionError(e: unknown, fallback: string): void {
  toast({ title: 'Erreur', description: errorMessage(e, fallback), variant: 'destructive' });
}
