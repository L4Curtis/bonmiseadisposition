export interface Contestation {
  id: string;
  message: string;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  resolutionMessage?: string;
  createdAt: string;
  updatedAt: string;
  bon: { id: string; reference: string; status: string; filiale: { displayName: string } };
  user: { id: string; displayName: string; email: string };
  resolvedBy?: { id: string; displayName: string } | null;
}

export interface ContestationResponse {
  contestations: Contestation[];
  total: number;
  page: number;
  limit: number;
  /** Total des contestations ouvertes, indépendant des filtres appliqués. */
  openCount?: number;
}
