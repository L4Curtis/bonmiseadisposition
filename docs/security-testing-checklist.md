# Checklist de Test — Audit de Securite (2026-03-23)

## 1. Build & Demarrage

```bash
# Backend
cd backend
npm install
npx tsc --noEmit          # 0 erreurs attendu
npm test                   # 32 tests passent

# Frontend
cd frontend
npm install
npm run build              # Build OK avec Vite 8.0.2
```

```bash
# Docker (si tu testes via compose)
docker compose build --no-cache
docker compose up -d
```

---

## 2. H1 — XSS dans les emails

**Fichier corrige** : `backend/src/notification/notification.service.ts`

1. Creer un bon avec un equipement personnalise dont le label est :
   ```
   <img src=x onerror=alert(1)>
   ```
2. Mettre comme numero de serie :
   ```
   "><script>alert('xss')</script>
   ```
3. Envoyer le bon pour signature (bouton "Envoyer")
4. Ouvrir l'email recu (ou regarder les logs SMTP si pas de serveur mail)
5. **Verifier** : le HTML de l'email doit contenir `&lt;img src=x onerror=alert(1)&gt;` et PAS `<img src=x`. Aucun script ne doit s'executer dans le client email

**Meme test pour un PV de cloture** : declarer un equipement non restitue avec un motif contenant `<script>test</script>`, verifier l'echappement dans l'email PV.

- [ ] Label equipement echappe
- [ ] Numero de serie echappe
- [ ] PV cloture — motif non restitue echappe

---

## 3. H2 — Mot de passe admin par defaut

**Fichier corrige** : `backend/src/auth/auth.service.ts`

1. Supprimer l'admin existant en base (ou repartir d'une base vide) :
   ```sql
   DELETE FROM "users" WHERE email = 'admin@local';
   ```
2. Redemarrer le backend
3. **Verifier dans les logs** : message du type :
   ```
   [WARN] Default local admin created: admin@local — temporary password: a1b2c3d4e5f6... (changement requis au premier login)
   ```
4. Le mot de passe doit etre une chaine hexa aleatoire de 32 caracteres, PAS `admin`
5. Se connecter avec ce mot de passe — redirige vers `/change-password?forced=true`
6. **Tester aussi avec la variable d'env** : ajouter `DEFAULT_ADMIN_PASSWORD=MonP@ssw0rd2026!` dans `.env`, redemarrer, verifier que ce mot de passe est utilise a la place

- [ ] Mot de passe aleatoire genere (pas `admin`)
- [ ] Mot de passe affiche dans les logs une seule fois
- [ ] Redirection vers changement obligatoire
- [ ] Variable d'env `DEFAULT_ADMIN_PASSWORD` respectee

---

## 4. M1 — JWT blacklist (logout immediat)

**Fichiers corriges** : `auth.service.ts`, `jwt.strategy.ts`, `auth.controller.ts`

1. Se connecter en admin local
2. Ouvrir les DevTools — Application — Cookies — copier la valeur de `access_token`
3. Se deconnecter (bouton logout)
4. Tester manuellement avec le token copie :
   ```bash
   curl -b "access_token=<TOKEN_COPIE>" http://localhost:4000/api/auth/me
   ```
5. **Attendu** : reponse `401 Unauthorized` (avant le patch, ca retournait les infos user pendant 15 min)

- [ ] Token revoque apres logout
- [ ] Appel API avec ancien token retourne 401

---

## 5. M2 — Rate limit sur change-password

**Fichier corrige** : `backend/src/auth/auth.controller.ts`

1. Se connecter
2. Envoyer 6 requetes rapides sur `/auth/change-password` :
   ```bash
   for i in {1..6}; do
     curl -s -o /dev/null -w "%{http_code}\n" \
       -X POST http://localhost:4000/api/auth/change-password \
       -H "Content-Type: application/json" \
       -H "X-Requested-With: XMLHttpRequest" \
       -b "access_token=<TOKEN>" \
       -d '{"currentPassword":"wrong","newPassword":"Test1234!@#$"}'
   done
   ```
3. **Attendu** : les 5 premieres retournent `401`, la 6e retourne `429 Too Many Requests`

- [ ] 5 requetes autorisees par minute
- [ ] 6e requete bloquee (429)

---

## 6. M3 — Rate limit sur logout

**Fichier corrige** : `backend/src/auth/auth.controller.ts`

Meme principe : 11 appels rapides sur `/auth/logout`, le 11e doit retourner `429`.

- [ ] 10 requetes autorisees par minute
- [ ] 11e requete bloquee (429)

---

## 7. M5 — Validation frontend Zod

**Fichiers corriges** : `Login.tsx`, `ChangePassword.tsx`, `BonCreate.tsx`, `PortailCollaborateur.tsx`
**Nouveau fichier** : `frontend/src/lib/validation.ts`

### Login

1. Aller sur `/login`, ouvrir le formulaire local
2. Taper un email invalide (ex: `pas-un-email`) et un mot de passe
3. Cliquer "Se connecter"
4. **Attendu** : message "Format email invalide" AVANT l'appel reseau (pas de requete envoyee)
5. Laisser le champ email vide — "L'email est requis"

- [ ] Email invalide detecte cote client
- [ ] Email vide detecte cote client

### Change-password

1. Aller sur `/change-password`
2. Mettre un nouveau mot de passe de 5 caracteres
3. **Attendu** : message "Minimum 12 caracteres" au submit

- [ ] Mot de passe trop court detecte cote client

### Creation de bon

1. Aller sur `/bons/nouveau`
2. Cliquer "Creer" sans remplir aucun champ
3. **Attendu** : message "Selectionnez un collaborateur" (ou autre premier champ manquant)
4. Remplir collaborateur + filiale mais laisser les equipements vides — "Ajoutez au moins un equipement"

- [ ] Champs obligatoires valides avant envoi
- [ ] Equipements vides detectes

### Contestation

1. Depuis le portail collaborateur, ouvrir une contestation
2. Taper 5 caracteres dans le motif
3. Cliquer "Envoyer"
4. **Attendu** : "Veuillez detailler le motif (au moins 10 caracteres)"

- [ ] Motif trop court detecte cote client

---

## 8. M6 — CSP sans unsafe-inline pour scripts

**Fichiers corriges** : `frontend/nginx.conf`, `nginx/nginx.conf`

1. Ouvrir l'application dans le navigateur
2. Ouvrir DevTools — Console
3. **Verifier** : aucune erreur CSP du type `Refused to execute inline script`
4. Le theme dark/light doit fonctionner correctement (le script inline est autorise par le hash)
5. Verifier le header dans DevTools — Network — document principal — Response Headers :
   ```
   Content-Security-Policy: ... script-src 'self' 'sha256-Z3x2+QkXC//7xJ/LmLpx2aSNwTY1uPNk5cFqW4/xsqQ=' ...
   ```
6. **Test negatif** : ouvrir la console JS et taper :
   ```js
   document.body.innerHTML += '<script>alert(1)</script>';
   ```
   L'alert ne doit PAS s'executer (bloque par CSP)

- [ ] Pas d'erreur CSP en console
- [ ] Theme dark/light fonctionne
- [ ] Header CSP contient le hash SHA-256
- [ ] Script inline injecte manuellement est bloque

---

## 9. B1 — Vite 8

**Fichier corrige** : `frontend/package.json`

1. `cd frontend && npx vite --version` — doit afficher `vite/8.0.2`
2. `npm audit` — 0 vulnerabilites
3. `npm run dev` — le serveur de dev demarre normalement, l'app fonctionne en local
4. `npm run build` — build de production OK

- [ ] Vite 8.0.2 installe
- [ ] 0 vulnerabilites npm audit
- [ ] Dev server fonctionne
- [ ] Build production OK

---

## 10. B2 — Limite taille PDF

**Fichier corrige** : `backend/src/pdf/pdf.service.ts`

Les PDF generes font typiquement 100-500 KB. Le guard est la en prevention.

1. Signer un bon normalement — le PDF doit se generer sans erreur
2. Le fix est visible dans `backend/src/pdf/pdf.service.ts` — une erreur sera lancee seulement si un PDF depasse 10 MB

- [ ] Signature d'un bon genere le PDF normalement

---

## Ordre recommande

1. **Build** (backend + frontend) — si ca build pas, rien d'autre ne marchera
2. **Tests automatises** (`npm test` backend) — 32 tests en 5 secondes
3. **H2** (mot de passe admin) — facile a tester, base propre
4. **M1** (JWT blacklist) — login/logout/curl
5. **M5** (validation Zod) — parcourir les 4 formulaires
6. **M6** (CSP) — verifier dans les DevTools
7. **H1** (XSS email) — necessite SMTP configure ou lecture des logs
8. **M2/M3** (rate limits) — boucle curl
9. **B1/B2** — verification version + audit
