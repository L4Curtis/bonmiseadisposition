/**
 * Contrats de l'API — point d'entrée unique : `import type { BonDetail } from
 * '@/contracts'` côté front, `from '../contracts'` côté back. Voir common.ts
 * pour les règles du dossier.
 */
export type * from './common';
export type * from './admin';
export type * from './attachments';
export type * from './audit';
export type * from './auth';
export type * from './bons';
export type * from './contestations';
export type * from './equipment';
export type * from './filiales';
export type * from './inventory';
export type * from './kpi';
export type * from './retention';
export type * from './signature';
export type * from './templates';
export type * from './users';
