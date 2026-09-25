'use strict';
/**
 * Gabarit Playwright des testeurs de recette : Chrome réel, en fenêtre, sur le
 * banc « bmad-recette » (voir GUIDE-TESTEUR.md).
 *
 * Ce qu'il fournit :
 *   - Chrome installé sur le poste (channel « chrome »), fenêtré, ralenti
 *     (slowMo) pour que l'on voie ce qui se passe ;
 *   - une adresse client propre au testeur (en-tête CF-Connecting-IP), pour
 *     que plusieurs testeurs en parallèle ne partagent pas les plafonds de
 *     débit du backend ;
 *   - des profils bureau (1440×900, 1280×800) et mobiles (iPhone 13, Pixel 7,
 *     tactiles, portrait et paysage) ;
 *   - capture(nom) : capture pleine page numérotée dans <rapport>/captures ;
 *   - le relevé des erreurs de la console et des réponses HTTP ≥ 400, écrit
 *     dans <rapport>/anomalies.json à la fermeture ;
 *   - la connexion par rôle, la lecture d'un lien de signature dans Mailpit
 *     et un tracé de signature (souris ou doigt selon le profil).
 *
 * Utilisation dans un script de parcours (à placer où l'on veut) :
 *   const { ouvrirSession } = require('C:/Users/clemieux/Claude/BonDeMiseADisposition/e2e/recette/gabarit-testeur.cjs');
 *   (async () => {
 *     const t = await ouvrirSession({ testeur: 'mobile-collab', profil: 'iphone13', rapport: 'C:/…/rapport-mobile' });
 *     try {
 *       await t.connecter('collaborateur');
 *       await t.capture('portail');
 *     } finally {
 *       await t.fermer();
 *     }
 *   })();
 *
 * Démonstration en ligne de commande :
 *   node e2e/recette/gabarit-testeur.cjs --profil pixel7 --role direction --rapport C:/…/demo
 */
const fs = require('node:fs');
const path = require('node:path');

const DEPOT = process.env.RECETTE_DEPOT || path.resolve(__dirname, '..', '..');
const { chromium, devices } = require(process.env.RECETTE_PLAYWRIGHT || path.join(DEPOT, 'e2e', 'node_modules', '@playwright', 'test'));
const { PERSONNES } = require(path.join(DEPOT, 'e2e', 'recette', 'amorcage', 'donnees', 'personnes.cjs'));

// Adresses du banc, fixes : un parcours de recette ne doit jamais pouvoir
// viser l'application de développement ni la pile E2E.
const BASE_URL = 'http://localhost:8082';
const MAILPIT_URL = 'http://localhost:8027';

/** Profils d'affichage. Les profils mobiles reprennent les appareils de Playwright (tactile, ratio, agent). */
function sansNavigateurImpose({ defaultBrowserType, ...options }) {
  return options;
}
const PROFILS = Object.freeze({
  'bureau-1440': { viewport: { width: 1440, height: 900 } },
  'bureau-1280': { viewport: { width: 1280, height: 800 } },
  iphone13: sansNavigateurImpose(devices['iPhone 13']),
  'iphone13-paysage': sansNavigateurImpose(devices['iPhone 13 landscape']),
  pixel7: sansNavigateurImpose(devices['Pixel 7']),
  'pixel7-paysage': sansNavigateurImpose(devices['Pixel 7 landscape']),
});

/** Rôle → compte de recette (voir GUIDE-TESTEUR.md, tableau des comptes). */
const ROLES = Object.freeze({
  admin: 'admin',
  technicien: 'tech1',
  technicien2: 'tech2',
  direction: 'direction',
  collaborateur: 'lea',
  'collaborateur-hugo': 'hugo',
  'collaborateur-karim': 'karim',
  'collaborateur-sophie': 'sophie',
});

/** Adresse client stable pour un nom de testeur (10.x.y.z), distincte d'un testeur à l'autre. */
function adresseClient(testeur) {
  let h = 2166136261;
  for (const c of testeur) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return `10.${(h >>> 16) % 250}.${(h >>> 8) % 250}.${(h % 250) + 1}`;
}

function nomDeFichier(texte) {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function compteDe(roleOuEmail, motDePasse) {
  if (motDePasse) return { email: roleOuEmail, motDePasse };
  const cle = ROLES[roleOuEmail] ?? roleOuEmail;
  const p = PERSONNES.find((x) => x.cle === cle || x.email === roleOuEmail);
  if (!p?.motDePasse) throw new Error(`Rôle ou compte inconnu, ou compte sans connexion : ${roleOuEmail}`);
  return { email: p.email, motDePasse: p.motDePasse };
}

/** Surveille une page : erreurs de console, exceptions, réponses HTTP ≥ 400, requêtes échouées. */
function surveiller(page, anomalies, etat) {
  const noter = (type, detail) => anomalies.push({ type, detail, url: page.url(), apresCapture: etat.derniere, a: new Date().toISOString() });
  page.on('console', (m) => { if (m.type() === 'error') noter('console', m.text()); });
  page.on('pageerror', (e) => noter('exception', e.message));
  page.on('response', (r) => { if (r.status() >= 400) noter('http', `${r.status()} ${r.request().method()} ${r.url()}`); });
  page.on('requestfailed', (r) => noter('requete-echouee', `${r.method()} ${r.url()} — ${r.failure()?.errorText ?? ''}`));
}

/** Tracé de signature sur le premier canevas visible : souris sur bureau, doigt (événements tactiles réels) sur mobile. */
async function tracerSignature(page, tactile, zone = page) {
  const canevas = zone.locator('canvas').first();
  await canevas.waitFor({ state: 'visible' });
  await canevas.scrollIntoViewIfNeeded();
  const b = await canevas.boundingBox();
  if (!b) throw new Error('Zone de signature introuvable');
  const points = Array.from({ length: 11 }, (_, i) => ({
    x: b.x + b.width * (0.15 + i * 0.06),
    y: b.y + b.height / 2 + Math.sin(i) * b.height * 0.15,
  }));
  if (!tactile) {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (const p of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

/**
 * Dernier lien de signature reçu par `adresse` dans Mailpit (chemin
 * « /signer/… »), en option pour une référence de bon donnée. Attend jusqu'à
 * 30 s : les emails partent en tâche de fond.
 */
async function lireMailpit(chemin) {
  const reponse = await fetch(`${MAILPIT_URL}${chemin}`);
  if (!reponse.ok) throw new Error(`Mailpit ${chemin} → ${reponse.status}`);
  return reponse.json();
}

async function lienDeSignature(adresse, { reference, delaiMs = 30_000 } = {}) {
  const limite = Date.now() + delaiMs;
  const requete = encodeURIComponent(`to:"${adresse}"`);
  while (Date.now() < limite) {
    const { messages } = await lireMailpit(`/api/v1/search?query=${requete}&limit=50`);
    for (const m of messages.filter((x) => !reference || x.Subject.includes(reference))) {
      const { HTML } = await lireMailpit(`/api/v1/message/${m.ID}`);
      const lien = (HTML ?? '').match(/\/signer\/[A-Za-z0-9_-]+/);
      if (lien) return lien[0];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Aucun lien de signature pour ${adresse}${reference ? ` (${reference})` : ''} dans Mailpit`);
}

/**
 * Navigation tolérante : sur ce poste, la toute première requête d'un Chrome
 * neuf reste parfois bloquée de longues secondes, voire est abandonnée
 * (net::ERR_ABORTED), alors que le banc répond en quelques millisecondes.
 * On réessaie donc deux fois, puis on attend le calme réseau sans en faire
 * une condition (une page qui interroge l'API en continu n'est pas en échec).
 */
async function naviguer(page, chemin) {
  for (let essai = 1; ; essai++) {
    try {
      await page.goto(chemin, { waitUntil: 'domcontentloaded' });
      break;
    } catch (err) {
      if (essai >= 3 || !/ERR_ABORTED|Timeout/.test(err.message)) throw err;
    }
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

async function creerContexte(navigateur, { testeur, profil, rapport }) {
  const options = PROFILS[profil];
  if (!options) throw new Error(`Profil inconnu : ${profil} (profils : ${Object.keys(PROFILS).join(', ')})`);
  const adresse = adresseClient(testeur);
  const contexte = await navigateur.newContext({
    ...options,
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  });
  // En-tête posé sur les seules requêtes vers le banc : envoyé aussi aux
  // polices Google (extraHTTPHeaders), il fait échouer leur contrôle CORS et
  // l'application s'afficherait avec une police de secours.
  await contexte.route(`${BASE_URL}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': adresse } }),
  );
  const anomalies = [];
  const etat = { rang: 0, derniere: null };
  // Toute page du contexte est surveillée, y compris un onglet ouvert par
  // l'application (PDF, aperçu…).
  contexte.on('page', (nouvelle) => surveiller(nouvelle, anomalies, etat));
  const page = await contexte.newPage();
  page.setDefaultNavigationTimeout(45_000);
  const dossierCaptures = path.join(rapport, 'captures');
  fs.mkdirSync(dossierCaptures, { recursive: true });
  const tactile = Boolean(options.hasTouch);

  /** Capture pleine page (ou seulement l'écran visible avec { pleinePage: false }) ; rend le chemin du fichier. */
  const capture = async (nom, { pleinePage = true } = {}) => {
    etat.rang += 1;
    const fichier = path.join(dossierCaptures, `${String(etat.rang).padStart(2, '0')}-${profil}-${nomDeFichier(nom)}.png`);
    await page.screenshot({ path: fichier, fullPage: pleinePage });
    etat.derniere = path.basename(fichier);
    return fichier;
  };

  /**
   * Les écrans IT font défiler un conteneur interne, pas la page : une
   * capture « pleine page » s'y arrête à la hauteur de l'écran. Celle-ci
   * capture l'écran, fait défiler le plus grand conteneur défilant d'un écran,
   * et recommence jusqu'en bas (au plus `max` captures).
   */
  const captureDefilee = async (nom, { max = 8 } = {}) => {
    const conteneur = await page.evaluateHandle(() => {
      const defilants = [...document.querySelectorAll('*')].filter((e) => {
        const style = getComputedStyle(e);
        return /(auto|scroll)/.test(style.overflowY) && e.scrollHeight > e.clientHeight + 10;
      });
      defilants.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
      return defilants[0] ?? document.scrollingElement;
    });
    await conteneur.evaluate((e) => e.scrollTo(0, 0));
    const fichiers = [];
    for (let i = 1; i <= max; i++) {
      fichiers.push(await capture(`${nom}-${i}`, { pleinePage: false }));
      const bloque = await conteneur.evaluate((e) => {
        const avant = e.scrollTop;
        e.scrollBy(0, e.clientHeight * 0.9);
        return e.scrollTop === avant;
      });
      if (bloque) break;
      await page.waitForTimeout(300);
    }
    await conteneur.dispose();
    return fichiers;
  };

  return {
    page,
    contexte,
    profil,
    testeur,
    adresse,
    anomalies,
    aller: (chemin) => naviguer(page, chemin),
    capture,
    captureDefilee,
    /** Connexion locale par rôle (« admin », « technicien », « direction », « collaborateur »…) ou par email + mot de passe. */
    connecter: async (roleOuEmail, motDePasse) => {
      const compte = compteDe(roleOuEmail, motDePasse);
      await naviguer(page, '/login');
      const boutonLocal = page.getByRole('button', { name: /compte local/i });
      if (await boutonLocal.isVisible().catch(() => false)) await boutonLocal.click();
      await page.getByLabel('Email').fill(compte.email);
      await page.getByLabel('Mot de passe').fill(compte.motDePasse);
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    },
    deconnecter: async () => {
      await contexte.clearCookies();
      await naviguer(page, '/login');
    },
    signer: (zone) => tracerSignature(page, tactile, zone),
    lienDeSignature,
  };
}

/**
 * Ouvre Chrome et une session de test. `testeur` : nom court et unique
 * (il fixe l'adresse client) ; `profil` : voir PROFILS ; `rapport` : dossier
 * où écrire captures et anomalies. `autreSession()` ouvre une seconde
 * session (autre compte, autre adresse) dans le même Chrome.
 */
async function ouvrirSession({ testeur, profil = 'bureau-1440', rapport, slowMo = 150 }) {
  if (!testeur || !rapport) throw new Error('ouvrirSession : « testeur » et « rapport » sont obligatoires');
  if (!PROFILS[profil]) throw new Error(`Profil inconnu : ${profil} (profils : ${Object.keys(PROFILS).join(', ')})`);
  const navigateur = await chromium.launch({ channel: 'chrome', headless: false, slowMo, args: ['--window-size=1500,1000'] });
  const sessions = [];
  const ouvrir = async (options) => {
    const s = await creerContexte(navigateur, { rapport, ...options });
    sessions.push(s);
    return s;
  };
  let principale;
  try {
    principale = await ouvrir({ testeur, profil });
  } catch (err) {
    // Pas encore de t.fermer() à la disposition de l'appelant : Chrome ne doit pas rester ouvert.
    await navigateur.close();
    throw err;
  }
  return {
    ...principale,
    autreSession: ({ testeur: autre, profil: autreProfil = profil }) => ouvrir({ testeur: autre, profil: autreProfil }),
    /** Écrit anomalies.json (toutes sessions) puis ferme Chrome, même si l'écriture échoue. */
    fermer: async () => {
      const toutes = sessions.flatMap((s) => s.anomalies.map((a) => ({ testeur: s.testeur, profil: s.profil, ...a })));
      try {
        fs.writeFileSync(path.join(rapport, 'anomalies.json'), JSON.stringify(toutes, null, 2), 'utf8');
      } finally {
        await navigateur.close();
      }
      return toutes;
    },
  };
}

async function demonstration(argv) {
  const lire = (nom, defaut) => {
    const i = argv.indexOf(`--${nom}`);
    return i >= 0 ? argv[i + 1] : defaut;
  };
  const profil = lire('profil', 'bureau-1440');
  const role = lire('role', 'admin');
  const rapport = lire('rapport', path.join(process.cwd(), 'rapport-recette'));
  const t = await ouvrirSession({ testeur: `demo-${role}-${profil}`, profil, rapport });
  try {
    await t.connecter(role);
    process.stdout.write(`Connecté (${role}, ${profil}) : ${t.page.url()}\n`);
    process.stdout.write(`Capture : ${await t.capture(`accueil-${role}`)}\n`);
  } finally {
    const anomalies = await t.fermer();
    process.stdout.write(`${anomalies.length} anomalie(s) relevée(s) — ${path.join(rapport, 'anomalies.json')}\n`);
  }
}

if (require.main === module) {
  demonstration(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.stack || err}\n`);
    process.exitCode = 1;
  });
}

module.exports = { ouvrirSession, lienDeSignature, adresseClient, PROFILS, ROLES, BASE_URL, MAILPIT_URL };
