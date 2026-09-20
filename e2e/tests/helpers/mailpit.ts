import { MAILPIT_URL } from './env';

interface MailpitAddress {
  Name: string;
  Address: string;
}

interface MailpitMessageSummary {
  ID: string;
  To: MailpitAddress[];
  Subject: string;
}

interface MailpitMessagesResponse {
  messages: MailpitMessageSummary[];
}

interface MailpitMessageDetail {
  HTML: string;
  Text: string;
  Subject: string;
  To: MailpitAddress[];
}

export interface ReceivedEmail {
  subject: string;
  html: string;
  text: string;
  to: string;
}

/**
 * Attend (poll court, pas de délai fixe unique) l'arrivée d'un email adressé
 * à `recipient` dans mailpit — le backend envoie en fire-and-forget, l'email
 * n'est donc pas forcément déjà là au moment où l'action UI se termine (la
 * génération du PDF joint peut notamment retarder un peu l'envoi du PV de
 * clôture — délai par défaut généreux : 45 s). Filtre optionnellement sur un
 * extrait du sujet quand plusieurs emails peuvent arriver pour le même
 * destinataire au cours d'un même test.
 */
export async function waitForEmailTo(
  recipient: string,
  options?: { subjectContains?: string | string[]; timeoutMs?: number },
): Promise<ReceivedEmail> {
  const deadline = Date.now() + (options?.timeoutMs ?? 45_000);
  const recipientLower = recipient.toLowerCase();
  // Toutes les sous-chaînes doivent être présentes (ex. la référence du bon +
  // un mot-clé du type de document) — utile quand un même destinataire (le
  // compte admin, voir tests/05-*) reçoit plusieurs emails au fil du test, ou
  // que la boîte mailpit n'est pas vidée entre deux exécutions consécutives.
  const requiredSubstrings = options?.subjectContains
    ? Array.isArray(options.subjectContains)
      ? options.subjectContains
      : [options.subjectContains]
    : [];

  while (Date.now() < deadline) {
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=100`);
    if (listRes.ok) {
      const list = (await listRes.json()) as MailpitMessagesResponse;
      const match = list.messages.find(
        (m) =>
          m.To?.some((t) => t.Address.toLowerCase() === recipientLower) &&
          requiredSubstrings.every((s) => m.Subject.includes(s)),
      );
      if (match) {
        const detailRes = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
        if (!detailRes.ok) throw new Error(`mailpit: lecture du message ${match.ID} échouée (${detailRes.status})`);
        const detail = (await detailRes.json()) as MailpitMessageDetail;
        const to = detail.To?.find((t) => t.Address.toLowerCase() === recipientLower)?.Address ?? recipient;
        return { subject: detail.Subject, html: detail.HTML, text: detail.Text, to };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`mailpit: aucun email reçu pour ${recipient} dans le délai imparti`);
}

/** Extrait le chemin `/signer/<token>` du corps HTML d'un email de demande de signature. */
export function extractSignerPath(html: string): string {
  const match = html.match(/\/signer\/[A-Za-z0-9_-]+/);
  if (!match) throw new Error("mailpit: aucun lien /signer/ trouvé dans le corps de l'email");
  return match[0];
}
