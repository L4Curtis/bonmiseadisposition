// Noms de périphériques réservés par Windows (interdits comme nom de
// fichier/dossier, avec ou sans extension) — cf. documentation Microsoft.
const RESERVED_WINDOWS_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * Remove accents and special characters from a name for filesystem use.
 *
 * L'ordre importe : trim() doit précéder la conversion espaces → tirets
 * (sinon un nom avec espace de tête/fin devient '-Nom-' au lieu de 'Nom' —
 * trim() ne retire que des espaces, pas des tirets). Un nom entièrement non
 * latin (ex. écrit uniquement en alphabet non latin) peut se réduire à une
 * chaîne vide après filtrage : on retombe alors sur 'INCONNU'. Enfin, les
 * noms réservés Windows (CON, PRN, NUL, COM1…) sont suffixés pour rester
 * utilisables comme composant de chemin sur un partage Windows.
 */
export function sanitizeSmbName(name: string): string {
  const cleaned = name
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  const base = cleaned || 'INCONNU';
  return RESERVED_WINDOWS_NAMES.test(base) ? `${base}_` : base;
}
