export interface AuditLog {
  id: string;
  action: string;
  userEmail?: string;
  ipAddress?: string;
  createdAt: string;
  details?: Record<string, unknown>;
  bon?: { id: string; reference: string } | null;
  // `resolved` = nom déduit de l'email côté backend (pas une vraie relation user)
  user?: { displayName: string; email: string; resolved?: boolean } | null;
}

export interface AuditResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}
