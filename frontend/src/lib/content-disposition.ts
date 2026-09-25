/**
 * Nom de fichier annoncé par le serveur dans l'en-tête `Content-Disposition`
 * (RFC 6266). Le serveur est la seule source du nom des exports : le
 * navigateur ne le reconstruit plus.
 *
 * - La forme encodée `filename*=UTF-8''…` (accents) l'emporte sur `filename=`.
 * - Tout chemin est retiré (« ../x », « C:\x ») et les caractères de contrôle
 *   supprimés : le nom sert tel quel à l'attribut `download` d'un lien.
 * - `null` quand l'en-tête est absent ou ne porte pas de nom exploitable.
 */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const raw = readEncodedFilename(header) ?? readPlainFilename(header);
  if (raw === null) return null;
  const cleaned = basename(stripControlCharacters(raw)).trim();
  return cleaned || null;
}

/** `filename*=UTF-8''nom%20encod%C3%A9.csv` ; null si absent ou mal encodé. */
function readEncodedFilename(header: string): string | null {
  const match = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (!match) return null;
  const value = match[1].trim().replace(/^"(.*)"$/, '$1');
  const encoded = value.replace(/^[\w-]+'[\w-]*'/, '');
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** `filename="nom.csv"` (guillemets échappés compris) ou `filename=nom.csv`. */
function readPlainFilename(header: string): string | null {
  const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(header);
  if (quoted) return quoted[1].replace(/\\(.)/g, '$1');
  const bare = /filename\s*=\s*([^;\s]+)/i.exec(header);
  return bare ? bare[1] : null;
}

function basename(name: string): string {
  const parts = name.split(/[/\\]/);
  return parts[parts.length - 1] ?? '';
}

function stripControlCharacters(name: string): string {
  return Array.from(name).filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x20 && code !== 0x7f;
  }).join('');
}
