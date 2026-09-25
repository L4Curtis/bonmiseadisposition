'use strict';
/**
 * Petites images PNG fabriquées sans dépendance (zlib de Node) : tracés de
 * signature, logos et cachets de filiale du banc de recette.
 *
 * Le backend n'accepte que de vrais PNG (préfixe data URL, signature d'octets
 * PNG, taille maximale) : ces images passent donc exactement par les mêmes
 * contrôles qu'un tracé fait à la main dans l'application.
 */
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Toile RGBA transparente. */
function toile(largeur, hauteur) {
  return { largeur, hauteur, pixels: Buffer.alloc(largeur * hauteur * 4) };
}

function poserPixel(t, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= t.largeur || y >= t.hauteur) return;
  const i = (Math.round(y) * t.largeur + Math.round(x)) * 4;
  t.pixels[i] = r;
  t.pixels[i + 1] = g;
  t.pixels[i + 2] = b;
  t.pixels[i + 3] = a;
}

/** Disque plein : sert de « pinceau » pour les traits épais. */
function disque(t, cx, cy, rayon, couleur) {
  for (let y = -rayon; y <= rayon; y++) {
    for (let x = -rayon; x <= rayon; x++) {
      if (x * x + y * y <= rayon * rayon) poserPixel(t, cx + x, cy + y, couleur);
    }
  }
}

function trait(t, points, epaisseur, couleur) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const pas = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= pas; s++) {
      disque(t, x0 + ((x1 - x0) * s) / pas, y0 + ((y1 - y0) * s) / pas, epaisseur, couleur);
    }
  }
}

function anneau(t, cx, cy, rayonExterieur, rayonInterieur, couleur) {
  for (let y = -rayonExterieur; y <= rayonExterieur; y++) {
    for (let x = -rayonExterieur; x <= rayonExterieur; x++) {
      const d2 = x * x + y * y;
      if (d2 <= rayonExterieur ** 2 && d2 >= rayonInterieur ** 2) poserPixel(t, cx + x, cy + y, couleur);
    }
  }
}

function rectangle(t, x0, y0, largeur, hauteur, couleur) {
  for (let y = y0; y < y0 + hauteur; y++) {
    for (let x = x0; x < x0 + largeur; x++) poserPixel(t, x, y, couleur);
  }
}

function encoder(t) {
  const lignes = Buffer.alloc((t.largeur * 4 + 1) * t.hauteur);
  for (let y = 0; y < t.hauteur; y++) {
    const debut = y * (t.largeur * 4 + 1);
    lignes[debut] = 0; // filtre « None »
    t.pixels.copy(lignes, debut + 1, y * t.largeur * 4, (y + 1) * t.largeur * 4);
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(t.largeur, 0);
  entete.writeUInt32BE(t.hauteur, 4);
  entete[8] = 8; // 8 bits par canal
  entete[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', entete),
    chunk('IDAT', zlib.deflateSync(lignes)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même graine, même image. */
function aleatoire(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function graineDe(texte) {
  let h = 2166136261;
  for (const c of texte) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * Tracé de signature propre à une personne (la même personne signe toujours
 * de la même façon d'un amorçage à l'autre), en data URL PNG.
 */
function signatureDataUrl(personne) {
  const hasard = aleatoire(graineDe(personne));
  const t = toile(420, 150);
  const encre = [20, 32, 90];
  const points = [];
  let x = 30;
  while (x < 380) {
    points.push([x, 75 + (hasard() - 0.5) * 70]);
    x += 12 + hasard() * 22;
  }
  trait(t, points, 2, encre);
  trait(t, [[40 + hasard() * 60, 118], [300 + hasard() * 60, 110 + hasard() * 12]], 1, encre);
  return `data:image/png;base64,${encoder(t).toString('base64')}`;
}

/** Rectangle aux coins arrondis (rayon r). */
function rectangleArrondi(t, x0, y0, largeur, hauteur, r, couleur) {
  rectangle(t, x0 + r, y0, largeur - 2 * r, hauteur, couleur);
  rectangle(t, x0, y0 + r, largeur, hauteur - 2 * r, couleur);
  for (const [cx, cy] of [[x0 + r, y0 + r], [x0 + largeur - r - 1, y0 + r], [x0 + r, y0 + hauteur - r - 1], [x0 + largeur - r - 1, y0 + hauteur - r - 1]]) {
    disque(t, cx, cy, r, couleur);
  }
}

/** Logo de filiale : carré arrondi de la couleur de la filiale et deux barres claires. */
function logoPng([r, g, b]) {
  const t = toile(240, 240);
  rectangleArrondi(t, 20, 20, 200, 200, 28, [r, g, b]);
  rectangle(t, 60, 70, 120, 26, [255, 255, 255]);
  rectangle(t, 60, 120, 80, 26, [255, 255, 255]);
  rectangle(t, 60, 170, 120, 10, [255, 255, 255, 180]);
  return encoder(t);
}

/** Cachet de filiale : double anneau et barre centrale, façon tampon encreur. */
function cachetPng([r, g, b]) {
  const t = toile(260, 260);
  const encre = [r, g, b, 230];
  anneau(t, 130, 130, 120, 110, encre);
  anneau(t, 130, 130, 96, 90, encre);
  rectangle(t, 55, 118, 150, 24, encre);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    disque(t, 130 + Math.cos(angle) * 103, 130 + Math.sin(angle) * 103, 3, encre);
  }
  return encoder(t);
}

module.exports = { signatureDataUrl, logoPng, cachetPng, aleatoire, graineDe };
