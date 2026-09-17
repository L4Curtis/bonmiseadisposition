/** Miroir de backend/src/common/email.ts : une adresse sans domaine complet
 *  (ex. `admin@local`) ne peut pas recevoir de lien de signature. */
const DELIVERABLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isDeliverableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DELIVERABLE_EMAIL_RE.test(email.trim());
}
