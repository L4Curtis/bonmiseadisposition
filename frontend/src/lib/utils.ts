import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * @deprecated Importer depuis `@/lib/dates`, seul module de formatage des
 * dates. Ces réexportations restent le temps que les écrans de
 * `pages/bons/**` changent leur import.
 */
export { formatDate, formatDateLong, formatDateTime } from './dates';
