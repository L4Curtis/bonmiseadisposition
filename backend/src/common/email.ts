/**
 * Une adresse est « délivrable » si elle a la forme locale@domaine.tld avec un
 * domaine comportant au moins un point. Les comptes techniques (`admin@local`)
 * ou saisis sans domaine complet sont rejetés par les serveurs SMTP
 * (« 501 5.1.6 Recipient addresses in single label domain ») : mieux vaut le
 * dire AVANT d'envoyer un lien de signature qu'après un échec silencieux.
 */
const DELIVERABLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isDeliverableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DELIVERABLE_EMAIL_RE.test(email.trim());
}

export function undeliverableEmailMessage(email: string | null | undefined): string {
  return `L'adresse email du collaborateur (${email || 'vide'}) n'est pas une adresse valide : le lien de signature ne peut pas être envoyé. Corrigez l'adresse ou utilisez la signature présentielle.`;
}
