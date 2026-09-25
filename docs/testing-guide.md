# Guide des tests

> Écrire et lancer les tests du projet : backend, frontend, base réelle, bout en bout. Destiné aux
> développeurs. Le nombre de tests change à chaque lot : il n'est volontairement pas écrit ici.

---

## Table des matières

1. [Stratégie de test](#1-stratégie-de-test)
2. [Tests backend](#2-tests-backend)
3. [Tests frontend](#3-tests-frontend)
4. [Objectifs de couverture](#4-objectifs-de-couverture)
5. [Tests à connaître](#5-tests-à-connaître)
6. [Ce qu'un nouveau test doit couvrir](#6-ce-quun-nouveau-test-doit-couvrir)
7. [Tests E2E](#7-tests-e2e)

---

## 1. Stratégie de test

| Couche | Outil | Portée | Où | En CI |
|--------|-------|--------|----|-------|
| **Tests unitaires backend** | Vitest 4 + `@nestjs/testing` | Services, contrôleurs, gardes, utilitaires, validation | `backend/src/**/__tests__/*.spec.ts` | job `backend` |
| **Tests sur base réelle** | Vitest + PostgreSQL | Requêtes SQL brutes, tris et filtres exécutés pour de bon | fichiers dont le nom contient `real-db` | job `backend` |
| **Tests frontend** | Vitest 5 + Testing Library (jsdom) | Composants, pages, hooks, logique pure | `frontend/src/**/__tests__/*.test.ts(x)` | job `frontend` |
| **Tests E2E** | Playwright + Docker Compose | Parcours complets dans l'application construite | `e2e/tests/` | job `e2e` |

### Principes

- Les **tests unitaires** remplacent par des doublures les dépendances externes (base, SMTP, LDAP, SMB).
- Une **réponse simulée doit avoir la forme réelle** de ce qu'elle remplace. Un test qui inventait la forme de
  la réponse d'une route a laissé passer un défaut en production (commit `650508f`, lecture de l'enveloppe des
  routes de numéro de série).
- Ce que seule une base détecte (casts d'énumération, `GROUP BY`, tri Prisma) se vérifie sur une **base
  réelle** (§ 2.6).
- Les **tests E2E** couvrent les parcours critiques : création de bon, signature IT, envoi par email,
  signature par email et en présentiel, restitution, non-restitution et PV, inventaire, portail du
  collaborateur, contestation, signature sur téléphone. Voir § 7.
- Aucune image n'est publiée si un de ces jobs échoue.

---

## 2. Tests backend

### 2.1 Framework et configuration

| Élément | Valeur |
|---------|--------|
| Lanceur | Vitest 4 |
| Transformation | SWC via `unplugin-swc` (émet les métadonnées de décorateurs dont dépend l'injection de NestJS) |
| Module de test | `@nestjs/testing` |
| Configuration | `backend/vitest.config.ts` |
| Nommage | `*.spec.ts` |
| Emplacement | Dossiers `__tests__/` à côté des sources |
| Couverture | `@vitest/coverage-v8`, seuils dans `vitest.config.ts` (effet cliquet : ils ne font que monter, cible 80 partout) |

Pourquoi Vitest : les paquets `@nestjs/*` sont publiés en ESM pur. Vitest laisse Node charger
`node_modules` : les tests exécutent le vrai code de NestJS, comme la production. La construction de
production (`nest build`, CommonJS) n'en dépend pas.

Différences avec Jest à connaître :

- `vi` remplace `jest` : `vi.fn()`, `vi.spyOn()`, `vi.mock()`, `vi.useFakeTimers()`… Les globales
  (`describe`, `it`, `expect`, `vi`) sont disponibles sans import dans les `*.spec.ts`
  (types : `backend/test/vitest-globals.d.ts`). Les types s'importent : `import type { Mock } from 'vitest'`.
- Les utilitaires de test qui ne sont pas des `*.spec.ts` (`common/__tests__/helpers`, fixtures) sont
  compilés par `nest build` : ils importent `vi` explicitement (`import { vi } from 'vitest'`).
- Les tests s'exécutent en ESM : pas de `require()` d'un module simulé. Pour manipuler un module
  remplacé par `vi.mock('fs/promises', …)`, importez-le normalement (`import * as fsp from 'fs/promises'`) :
  l'import reçoit la doublure. Pour garder le reste du vrai module :
  `vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('fs')>()), existsSync: vi.fn() }))`.
- Un module CommonJS dont l'export est lui-même une classe ou une fonction (`module.exports = X`,
  par exemple `pdfkit`) s'importe avec `import X = require('x')`, pas `import * as X` (un espace de noms ESM
  n'est pas constructible). La compilation de production est identique.
- `di-metadata.spec.ts` et `import-order.spec.ts` (garde-fous contre les cycles d'import, qui ont déjà
  cassé la production) ne passent pas par Vitest pour charger le code : ils lancent un processus Node
  neuf qui compile les sources avec le compilateur TypeScript (programme complet de
  `tsconfig.build.json`, comme `nest build`) et les charge par `require()`
  (`backend/test/helpers/production-load-report.cjs`). Une transpilation fichier par fichier, ou SWC,
  remplacerait l'`undefined` d'un cycle par `Object` et rendrait ces garde-fous aveugles.

### 2.2 Commandes d'exécution

```bash
cd backend

# Lancer tous les tests
npm test

# Mode surveillance (relance à chaque modification)
npm run test:watch

# Rapport de couverture avec seuils (HTML dans ./coverage/index.html)
npm run test:cov

# Lancer les fichiers dont le chemin contient « bons »
npx vitest run bons

# Lancer un fichier de test précis
npx vitest run src/auth/__tests__/auth-security.spec.ts

# Mode détaillé (une ligne par test)
npx vitest run --reporter=verbose

# Suites sur base réelle (base lancée, migrations appliquées ; fichiers exécutés
# l'un après l'autre, voir vitest.config.ts et § 2.6)
RUN_DB_TESTS=1 npx vitest run real-db
```

Sous Linux (comme la CI) depuis le poste Windows : le `node_modules` du poste contient des binaires
natifs Windows (SWC, Rolldown) inutilisables dans un conteneur Linux. Copier le dossier sans
`node_modules` et installer dans le conteneur :

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "C:/Users/clemieux/Claude/BonDeMiseADisposition/backend:/src:ro" node:22-alpine sh -c \
  'mkdir /app && cd /src && tar --exclude=./node_modules --exclude=./dist --exclude=./coverage --exclude=./data -cf - . | tar -xf - -C /app \
   && cd /app && apk add --no-cache openssl >/dev/null && npm ci && npx prisma generate && npm run test:cov'
```

### 2.3 Écrire un test de service

Chaque service NestJS reçoit ses dépendances par le constructeur. Dans un test, on construit un module de
test avec le vrai service et des doublures pour ses dépendances, fournies par les fabriques partagées de
`backend/src/common/__tests__/helpers/`. Modèle complet : `backend/src/bons/__tests__/bons.service.spec.ts`.

```typescript
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BonsService } from '../bons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService } from '../../signature/signature.service';
import { NotificationService } from '../../notification/notification.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';
import { AppConfigService } from '../../config/config.service';
import { createMockPrismaService } from '../../common/__tests__/helpers/mock-prisma';
import {
  createMockConfigService,
  createMockNotificationService,
  createMockPdfService,
  createMockSignatureService,
  createMockSmbService,
} from '../../common/__tests__/helpers/mock-services';
import { activeBon } from '../../common/__tests__/fixtures/bon.fixtures';

describe('BonsService', () => {
  let service: BonsService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SignatureService, useValue: createMockSignatureService() },
        { provide: NotificationService, useValue: createMockNotificationService() },
        { provide: PdfService, useValue: createMockPdfService() },
        { provide: SmbService, useValue: createMockSmbService() },
        { provide: AppConfigService, useValue: createMockConfigService() },
      ],
    }).compile();
    service = moduleRef.get(BonsService);
  });

  it('refuse d\'annuler un bon déjà signé', async () => {
    prisma.bon.findUnique.mockResolvedValue(activeBon());
    await expect(service.cancel(activeBon().id, 'user-tech-001')).rejects.toThrow(BadRequestException);
    expect(prisma.bon.updateMany).not.toHaveBeenCalled();
  });
});
```

Beaucoup d'étapes du métier sont des fonctions à dépendances explicites (`bons/workflow/*.ts`,
`signature/*.ts`, `kpi/*.ts`) : elles se testent sans module NestJS, en leur passant directement les
doublures. Une fonction pure (`escapeHtml`, calcul de période, prédicat) se teste sans aucune doublure.

### 2.4 Doublures

**Prisma.** `createMockPrismaService()` renvoie un `PrismaService` dont chaque méthode de chaque modèle est
une `vi.fn()`. Sa méthode `$transaction` exécute le rappel en lui passant la doublure elle-même, comme Prisma
passe un client transactionnel : ne la remplacez pas par un `vi.fn()` nu, qui ne renverrait rien.

**Services.** `mock-services.ts` fournit une fabrique par service partagé : notifications, signature, PDF,
SMB, configuration, chiffrement, horodatage, modèles PDF et d'email, suivi des tâches planifiées. Aucun test
unitaire n'appelle un vrai serveur SMTP, LDAP ou SMB.

**Ne doublez que les dépendances directes.** Un test de `BonsService` remplace `SignatureService`, pas les
dépendances de `SignatureService`.

**Forme des réponses.** Une valeur simulée reprend la forme réelle : une ligne Prisma telle que la requête la
sélectionne, la réponse d'une route telle que son contrôleur la renvoie. Pour une route consommée par le
frontend, la forme de référence est celle que vérifient les tests de contrat HTTP (section « Tests de contrat
HTTP »).

### 2.5 Jeux de données

`backend/src/common/__tests__/fixtures/` contient des fabriques qui renvoient un **objet neuf à chaque
appel** : un test peut modifier le sien sans toucher aux autres.

| Fichier | Fabriques |
|---|---|
| `bon.fixtures.ts` | `draftBon`, `sentMiseDispoBon`, `activeBon`, `sentRestitutionBon`, `partiallyReturnedBon`, `archivedBon`, `cancelledBon`, `contestedBon` |
| `user.fixtures.ts` | `adminUser`, `technicianUser`, `collaboratorUser`, `localAdminUser`, `manualAccountUser` |

Les bons suivent le format réel des références (`BON-AAAA-NNNN`) et la forme sélectionnée par les requêtes
du service.

### 2.6 Tests sur base réelle

Les services qui écrivent du SQL brut (`$queryRaw`) sont testés deux fois :

1. **Unitairement**, en vérifiant le texte SQL généré : présence des casts `::text` sur les colonnes
   d'énumération, `::float8` sur les moyennes, absence de comparaison d'énumération sans cast (voir § 5).
2. **Contre une vraie base PostgreSQL**, dans les fichiers dont le nom contient `real-db` :
   `backend/src/__tests__/sql-real-db.spec.ts` (inventaire et indicateurs),
   `backend/src/reporting/__tests__/inventory-sort.real-db.spec.ts` (tris, filtres et pagination de
   l'inventaire) et `backend/src/common/dates/__tests__/paris-sql.real-db.spec.ts` (fragments SQL « heure
   de Paris », comparés aux fonctions JavaScript, quel que soit le fuseau de la session). Sans
   `RUN_DB_TESTS=1`, ces suites sont ignorées.

En CI, le job `backend` démarre un PostgreSQL 16 jetable (`TZ=UTC`), applique les migrations puis lance
`RUN_DB_TESTS=1 npx vitest run real-db`. Une nouvelle suite dont le nom contient `real-db` y est prise
automatiquement. Avec la base, les fichiers s'exécutent l'un après l'autre (`fileParallelism` dans
`vitest.config.ts`).

En local, utilisez une **base jetable** plutôt que la base de développement : certaines suites insèrent
leurs propres données.

```bash
docker run --rm -d --name bons-test-db -p 127.0.0.1:5433:5432 -e TZ=UTC \
  -e POSTGRES_DB=bons_disposition -e POSTGRES_USER=app -e POSTGRES_PASSWORD=test postgres:16-alpine
cd backend
export DATABASE_URL=postgresql://app:test@127.0.0.1:5433/bons_disposition
npx prisma migrate deploy && RUN_DB_TESTS=1 npx vitest run real-db
docker stop bons-test-db
```

### 2.7 Transitions d'état et erreurs

Pour une action sur un bon, vérifiez au minimum :

- la transition permise : le statut écrit, et la condition sur le statut de départ dans la même écriture
  (`updateMany` avec le statut attendu), qui produit un `409` si le bon a changé entre-temps ;
- les transitions refusées depuis chaque autre statut (`BadRequestException` ou `ConflictException`) ;
- le bon introuvable (`NotFoundException`) et l'accès d'un collaborateur au bon d'un autre
  (`ForbiddenException`) ;
- les effets de bord attendus, et leur absence en cas d'échec : email, PDF, ligne d'audit.

---

## 3. Tests frontend

### 3.1 Framework et configuration

| Élément | Valeur |
|---------|--------|
| Lanceur | Vitest 5, environnement jsdom |
| Rendu et interactions | `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` |
| Configuration | `frontend/vitest.config.ts` (séparée de `vite.config.ts`) |
| Préparation | `frontend/src/test/setup.ts` : nettoyage entre les tests, délai d'attente des `findBy*` porté à 5 s, compléments jsdom dont Radix a besoin (`hasPointerCapture`, `scrollIntoView`, `ResizeObserver`) |
| Rendu avec routeur | `frontend/src/test/render.tsx` : `renderWithProviders(ui, { route, path })` renvoie aussi une instance `user` de `userEvent` |
| Typage des tests | `tsconfig.test.json`, vérifié en CI |
| Nommage | `*.test.ts` ou `*.test.tsx`, dans des dossiers `__tests__/` à côté des sources |

```bash
cd frontend
npm test                                   # toute la suite
npx vitest run src/pages/bons              # un dossier
npx vitest                                 # mode surveillance
npx tsc --noEmit -p tsconfig.test.json     # typage des tests, comme la CI
```

### 3.2 Simuler l'API

Il n'y a pas de serveur simulé (pas de MSW). Chaque test remplace le module `@/lib/api` et répond selon le
chemin appelé :

```typescript
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '@/lib/api';

vi.mocked(api.get).mockImplementation((path: string) => {
  if (path === '/admin/retention/stats') return Promise.resolve(STATS);
  return Promise.resolve(null);
});
```

Modèle complet : `frontend/src/pages/admin/configuration/__tests__/ConfigRetentionPage.test.tsx`. Les
réponses simulées reprennent la forme réelle des routes (§ 2.4). Un composant qui lit `useAuth()` se teste
en simulant `@/contexts/AuthContext`.

### 3.3 Règles

- Sélecteurs par rôle, libellé ou texte visible (`getByRole`, `getByLabelText`), jamais par classe CSS.
- Aucune attente fixe : `findBy*` et `waitFor`.
- Recharts ne rend rien sous jsdom sans simuler `ResponsiveContainer`.
- La logique pure (filtres, calculs, formats) vit dans des fichiers `lib/` testés sans rendu.

---

## 4. Objectifs de couverture

| Cible | Règle |
|-------|-------|
| **Backend** | Seuils appliqués en CI par `npm run test:cov`, définis dans `backend/vitest.config.ts` pour les instructions, les branches, les fonctions et les lignes. Effet cliquet : chaque seuil suit la mesure réelle et ne redescend jamais. Cible à terme : 80 pour les quatre. |
| **Frontend** | Aucune mesure de couverture configurée. Chaque écran ou hook modifié reçoit ses tests. |

Un seuil se relève quand la couverture progresse d'elle-même, jamais en ajoutant des tests sans valeur pour
atteindre un chiffre.

```bash
cd backend
npm run test:cov    # rapport HTML dans backend/coverage/index.html
```

---

## 5. Tests à connaître

Les garde-fous transverses, à ne jamais désactiver :

| Fichier | Ce qu'il protège |
|---------|------------------|
| `backend/src/__tests__/di-metadata.spec.ts`, `import-order.spec.ts` | Aucun cycle d'import ne casse l'injection de dépendances au démarrage de la production (§ 2.1) |
| `backend/src/__tests__/sql-real-db.spec.ts`, `backend/src/reporting/__tests__/inventory-sort.real-db.spec.ts` | Les requêtes SQL brutes, les tris et la pagination s'exécutent sur une vraie base (§ 2.6) |
| `backend/src/auth/__tests__/route-access.spec.ts` | Chaque route déclare qui peut l'appeler (`@Roles` ou `@Public`) ; la table complète route → rôles est comparée à `__snapshots__/route-access.md`, versionnée, pour que tout changement de droits se voie en revue. Après un changement voulu : `npx vitest run src/auth/__tests__/route-access.spec.ts -u` |
| `backend/src/auth/guards/__tests__/roles.guard.spec.ts` | Le contrôle des rôles, refus par défaut compris |
| `backend/src/auth/__tests__/auth-security.spec.ts` | Révocation des jetons, mot de passe initial de `admin@local`, politique de mot de passe |
| `backend/src/notification/__tests__/email-xss.spec.ts` | Échappement HTML des valeurs insérées dans les emails |
| `backend/src/common/__tests__/bon-predicates.spec.ts` | Les prédicats métier partagés (retard de signature, équipement prêté, situation) |
| `backend/src/common/dates/__tests__/paris.spec.ts` et les tests d'export qui appellent `useHostTimeZone('UTC')` (`common/__tests__/helpers/host-time-zone.ts`) | Les dates « à l'heure de Paris » restent justes sur un serveur réglé en UTC, comme la production, alors que le poste de développement est à l'heure de Paris : un instant entre 0 h et 2 h garde son jour parisien |

Le tableau de bord, bon exemple de tests d'indicateurs :

| Fichier | Ce qui est vérifié |
|---------|---------------------|
| `backend/src/kpi/__tests__/kpi-period.spec.ts` | Période par défaut, période précédente, granularité aux bornes 31/32 et 182/183 jours, regroupements, rejets (`from > to`, date invalide, écart de plus de 731 jours) |
| `backend/src/kpi/__tests__/kpi-sql.spec.ts` | Fragments SQL communs (bornes de période ramenées en UTC, filtre de filiale) |
| `backend/src/kpi/__tests__/kpi-cache.service.spec.ts` | Durée de vie de 60 s, requêtes identiques simultanées calculées une seule fois, éviction |
| `backend/src/kpi/__tests__/kpi.controller.spec.ts` | Rôles autorisés, clé de cache |
| `backend/src/kpi/__tests__/kpi-{parc,delais,incidents}.service.spec.ts` | Un fichier par onglet (voir le modèle ci-dessous) |
| `frontend/src/pages/dashboard/__tests__/DashboardPage.test.tsx` | Onglets affichés selon le rôle, choix de l'onglet par `?tab=` |
| `frontend/src/pages/dashboard/tabs/__tests__/*.test.tsx` | Appel de l'API avec `from`, `to` et `filialeId`, rendu des tuiles et graphiques, erreur avec « Réessayer » |
| `frontend/src/components/dashboard/charts/__tests__/charts.test.tsx` | Graphiques, avec `ResponsiveContainer` simulé |
| `frontend/src/pages/__tests__/App.direction.test.tsx` | Rôle `direction` : arrivée sur l'onglet Parc, `/bons` refusé, redirection de `/admin/reports` |

### Modèle : `$queryRaw` simulé selon le texte SQL

Les services d'indicateurs enchaînent plusieurs requêtes `Prisma.sql` sur le même `$queryRaw`. Plutôt que de
répondre selon l'ordre des appels (fragile dès qu'une requête est ajoutée ou déplacée), chaque test choisit
la réponse d'après un fragment unique du SQL généré, et reconnaît la période précédente à la présence de sa
date de début parmi les valeurs liées :

```typescript
function buildRouter(period: KpiPeriod) {
  return (query: Prisma.Sql): Promise<unknown[]> => {
    const sql = query.sql;
    const isPreviousRange = (query.values as unknown[]).includes(period.previous.from);

    if (sql.includes('AS total, COUNT(DISTINCT b.id)')) {
      return Promise.resolve([{ total: 120n, bons: 80n }]);
    }
    if (sql.includes('a.created_at')) {
      return Promise.resolve(isPreviousRange ? [{ declared: 6n }] : [{ declared: 4n }]);
    }
    // ...
    return Promise.resolve([]);
  };
}
```

Les réponses sont des `bigint` (`120n`), comme celles de PostgreSQL pour un `COUNT`. Chaque test vérifie
ensuite, sur le texte SQL collecté (`prisma.$queryRaw.mock.calls`), la présence des casts obligatoires :

```typescript
expect(calls.some((sql) => sql.includes('b.status::text IN ('))).toBe(true);
expect(calls.some((sql) => sql.includes('ec.category::text'))).toBe(true);
expect(sql).not.toMatch(/b\.status\s+(NOT\s+)?IN\s*\(/); // jamais de comparaison d'énumération sans cast
```

Cette vérification du texte SQL aurait détecté le défaut `operator does not exist: "BonStatus" = text` avant la
production (commit `a19ea00`). Elle ne remplace pas l'exécution sur une vraie base (§ 2.6), qui seule voit
les erreurs de `GROUP BY` ou de tri.

---

## 6. Ce qu'un nouveau test doit couvrir

Pour un service ou une action :

- [ ] le cas nominal, avec ses effets (écritures, email, PDF, audit) ;
- [ ] chaque transition d'état permise, et les transitions refusées ;
- [ ] l'entité introuvable (`NotFoundException`) et l'accès refusé (`ForbiddenException`) ;
- [ ] les données invalides (`BadRequestException`) et le conflit de concurrence (`ConflictException`) ;
- [ ] l'échec au milieu d'une `$transaction` : rien n'est écrit à moitié ;
- [ ] les cas limites : liste vide, pagination hors bornes, champ facultatif absent, dates autour de minuit
      à Paris.

Pour un écran : l'affichage nominal, le chargement, la liste vide, l'erreur avec nouvelle tentative, les
actions permises selon le rôle, et la largeur d'un téléphone quand l'écran s'y utilise.

---

## 7. Tests E2E

Suite Playwright dans `e2e/`, exécutée à chaque push par le job `e2e` de la CI. Elle joue l'application
réellement construite depuis les sources (mêmes Dockerfiles qu'en production), contre une base et un serveur
d'emails jetables.

Ces tests existent parce qu'une suite unitaire ne les remplace pas : la régression « signature IT refusée sur
un brouillon », qui rendait tout envoi impossible depuis l'interface, n'a été vue que par un parcours
navigateur.

### 7.1 Ce qui est couvert

**Onze parcours**, un par fichier, numérotés de `02` à `12` (il n'y a pas de fichier `01`). Ils sont précédés
de la connexion partagée (`auth.setup.ts`) et s'appuient sur `tests/fixtures.ts` et `tests/helpers/`.

| Fichier | Parcours |
|---------|----------|
| `tests/auth.setup.ts` | Connexion locale de l'administrateur, changement de mot de passe imposé, session réutilisée par les parcours |
| `tests/02-envoi-email.spec.ts` | Création d'un bon, signature IT, envoi : l'email de demande de signature arrive avec son lien |
| `tests/03-presentiel-signature.spec.ts` | Signature en présentiel jusqu'au bon en cours et au PDF disponible |
| `tests/04-sans-adresse.spec.ts` | Collaborateur sans adresse : envoi par email refusé avec la bonne explication, présentiel possible |
| `tests/05-restitution-non-rendu.spec.ts` | Restitution partielle, équipement déclaré non restitué, PV de non-restitution, clôture |
| `tests/06-inventaire-par-collaborateur.spec.ts` | Vue « Par collaborateur » de l'inventaire : la personne apparaît avec ses équipements |
| `tests/07-restitution-sans-adresse.spec.ts` | Collaborateur sans adresse : restitution par email refusée, le bon reste en cours |
| `tests/08-portail-collaborateur.spec.ts` | Portail `/mes-bons`, côté collaborateur connecté : il voit son bon, l'ouvre, télécharge le PDF ; le bon d'un autre n'apparaît pas et son adresse directe est refusée (« Accès refusé à ce bon ») |
| `tests/09-contestation.spec.ts` | Le collaborateur conteste depuis le portail ; l'IT voit la pastille du menu, traite la contestation dans la page Contestations (rejet avec réponse) ; le collaborateur retrouve son bon en cours et reçoit l'email de réponse (Mailpit) |
| `tests/10-fiche-materiel.spec.ts` | Depuis l'inventaire, le n° de série puis le n° d'inventaire ouvrent l'historique de l'équipement (`/materiel/:reference`), qui nomme le détenteur actuel |
| `tests/11-creation-rapide.spec.ts` | Création rapide : date du jour pré-remplie, filiale remplie par le choix du collaborateur, n° de série déjà prêté signalé à la sortie du champ, Entrée dans « N° Série » ajoute une ligne sans soumettre |
| `tests/12-signature-mobile.spec.ts` | Signature présentielle au doigt sur téléphone (390 × 844, tactile) : le bon passe en cours |

### 7.2 Lancer la suite en local

Docker est nécessaire. L'environnement est isolé de celui de développement : projet Compose `bmad-e2e`,
ports 8081 (application) et 8026 (Mailpit), base éphémère. Rien n'est écrit dans la base de développement.

```bash
# 1. Construire et démarrer
docker compose -p bmad-e2e -f e2e/docker-compose.e2e.yml up -d --build

# 2. Attendre que l'application réponde
curl -fsS http://localhost:8081/api/health/ready

# 3. Amorcer les données (une fois, sur une base neuve)
bash e2e/seed/seed.sh bmad-e2e

# 4. Dépendances et navigateur (une seule fois)
cd e2e && npm ci && npx playwright install chromium

# 5. Lancer
npx playwright test          # toute la suite
npx playwright test 05       # un seul fichier
npx playwright test --headed # en voyant le navigateur

# 6. Nettoyer (conteneurs et volumes)
docker compose -p bmad-e2e -f e2e/docker-compose.e2e.yml down -v
```

L'amorçage (`e2e/seed/seed.sql`) crée une filiale active, un collaborateur avec adresse, un collaborateur
sans adresse, un collaborateur **à compte local** (`seed.portail@e2e.local`, mot de passe factice
`E2ePortail#2026`, voir `tests/helpers/env.ts`) et un article de catalogue. Ce compte local est le seul
collaborateur capable de se connecter ici (ni annuaire ni Entra) : les parcours du portail l'utilisent. Les
tests créent ensuite leurs propres données.

L'amorçage se rejoue tant qu'aucun test n'a tourné ; après une exécution, les bons créés référencent la
filiale et les collaborateurs amorcés et le nettoyage échoue : repartir de `down -v`.

### 7.3 Écrire un test

- **Importer `test` et `expect` depuis `./fixtures`**, jamais directement depuis `@playwright/test`. La
  fixture donne à chaque test sa propre adresse client (en-tête `CF-Connecting-IP`, que le nginx du
  frontend reconnaît). Le backend plafonne certaines routes par adresse (signature IT : 10 par minute) : en CI,
  les parcours s'enchaînent en moins d'une minute depuis une seule adresse et recevaient des 429 « Trop de
  requêtes » en plein parcours. Un contexte créé à la main (`browser.newContext`) représente un autre
  appareil : lui donner sa propre adresse avec `adresseClient()`.
- Pour reproduire exactement la CI (Linux, Chromium livré par Playwright, fuseau UTC, langue anglaise),
  lancer les tests dans l'image `mcr.microsoft.com/playwright:v<version>-noble` contre la compose, avec
  `E2E_BASE_URL=http://host.docker.internal:8081` : un test vert dans le Chrome local en français peut
  échouer là, parce que tout y va plus vite.
- Un test crée ce dont il a besoin (helpers de `tests/helpers/`) : aucun test ne dépend de ce qu'un autre a
  laissé derrière lui.
- Sélecteurs par rôle, libellé ou texte visible, jamais par classe CSS. Attention aux libellés inclus les uns
  dans les autres : « Nom » correspond aussi à « Prénom », d'où `exact: true`.
- Aucune attente fixe. Pour un email, `waitForEmailTo` (helper Mailpit) interroge la boîte jusqu'à réception,
  avec un délai maximal généreux : l'envoi SMTP réel prend parfois quelques secondes sur une machine chargée.
- La suite s'exécute en série (`workers: 1`) : tous les tests partagent la même boîte Mailpit et la même
  session administrateur. C'est volontaire, et sans coût réel vu la taille de la suite.
- Deux points de vue dans un même test : la fixture `page` porte la session admin ; `openPortailSession`
  (`tests/helpers/portail.ts`) ouvre un second contexte, connecté avec le compte collaborateur. Pour un
  téléphone, un contexte avec `viewport`, `isMobile` et `hasTouch`, et `drawSignatureByTouch` qui envoie de
  vrais évènements tactiles (`page.touchscreen` ne sait que taper un point, pas tracer).

Pièges déjà rencontrés, traités dans les helpers : le canevas de signature doit être ramené dans la fenêtre
avant de dessiner (`page.mouse` ne fait pas défiler, contrairement à `click`) ; l'attente d'URL d'un bon
utilise un identifiant strict, sinon `/bons/new` correspond aussi ; le formulaire de création démarre avec une
ligne d'équipement vide, donc on vise toujours la dernière ligne ajoutée ; le mot de passe de `admin@local` ne
peut être changé qu'une fois, la connexion de la session gère les deux cas. Juste après la création d'un bon,
le titre du formulaire est parfois encore affiché : la référence se lit sur un titre au motif `BON-AAAA-`.
Dans l'inventaire, la recherche est appliquée avec 300 ms de retard puis écrite dans l'URL : cliquer un lien
avant cela peut ramener à l'inventaire pendant le chargement de la page visée, d'où l'attente de
`search=` dans l'URL avant le clic.

### 7.4 Lire un échec en CI

Le job `e2e` publie `playwright-report` en artefact quand il échoue. Il contient, pour chaque test rouge, la
capture d'écran, la vidéo et la trace (`npx playwright show-trace <fichier>` rejoue le parcours pas à pas).
Les journaux des conteneurs sont affichés dans le job lui-même : ils permettent de distinguer un vrai défaut
de l'application d'un test instable.

---

## Annexe : dépendances des principaux services

Ce qu'un test doit doubler, d'après le constructeur de chaque service. Le constructeur fait foi : relisez-le
si ce tableau vous semble en retard.

```
BonsService
  ├── PrismaService
  ├── SignatureService
  │     ├── PrismaService
  │     ├── EncryptionService
  │     ├── AppConfigService
  │     ├── TimestampService
  │     ├── PdfService
  │     ├── SmbService
  │     └── ModuleRef (résout BonsService au moment de l'appel, jeton BONS_SERVICE)
  ├── NotificationService
  │     ├── AppConfigService
  │     ├── PrismaService
  │     ├── TemplatesService
  │     └── JobTrackerService
  ├── PdfService
  │     ├── PrismaService
  │     ├── PdfTemplatesService
  │     └── EncryptionService
  ├── SmbService
  │     ├── AppConfigService
  │     ├── PrismaService
  │     └── JobTrackerService
  └── AppConfigService

ContestationService
  ├── PrismaService
  ├── NotificationService
  ├── SignatureService
  └── BonsService (injecté par forwardRef)

AuthService
  ├── AppConfigService
  ├── PrismaService
  └── JwtService

EquipmentService
  └── PrismaService

LdapService
  ├── AppConfigService
  ├── PrismaService
  ├── JobTrackerService
  └── NotificationService
```

Un test ne double que les dépendances **directes** du service testé (§ 2.4) : celui de `BonsService` remplace
`SignatureService`, pas les dépendances de `SignatureService`. Les doublures des services partagés viennent
de `common/__tests__/helpers/mock-services.ts`.

## Tests de contrat HTTP

**Pourquoi.** Les tests unitaires du backend appellent les services directement, et ceux du front
simulent l'API avec des réponses écrites à la main. Aucun d'eux ne voit une réponse qui change de forme :
c'est ce qui a caché le bug du commit `650508f` (`/equipment/serial-conflicts` passé d'un tableau à
`{ items, truncated }`, avertissement disparu, tests verts). Les tests de contrat interrogent
l'application Nest **réelle** par de vraies requêtes HTTP (supertest) et vérifient, pour chaque route
appelée par le front :

- le **code HTTP** ;
- la **forme exacte** de la réponse (clés et types, ni plus ni moins) ;
- les **droits** : 401 sans session, 403 pour chaque rôle non autorisé, accès pour les rôles autorisés.

**Où.**

| Emplacement | Contenu |
|---|---|
| `backend/src/contracts/` | Types TypeScript des réponses actuelles, un fichier par domaine (types seuls, aucun import hors du dossier). |
| `frontend/src/contracts/` | Copie **générée** de ces types (en-tête « ne pas modifier »), par `npm run sync-contracts`. |
| `backend/test/contract/*.contract.ts` | Les tests, un fichier par domaine. Les règles d'accès sont regroupées en tête de chaque fichier (tableau `ACCESS`). |
| `backend/test/contract/shapes/` | Les formes vérifiées, écrites avec `object<TypeDuContrat>({ … })`. |
| `backend/test/contract/support/` | Application montée avec la configuration HTTP de production (`src/bootstrap/configure-app.ts`, la même que `main.ts`), jeu de données, client HTTP, garde-fous. |

`object<T>()` exige à la compilation une entrée par clé du type `T` (une clé facultative passe par
`optional()`, une clé nullable par `nullable()`), et à l'exécution exactement ces clés dans la réponse.
Forme déclarée et forme vérifiée ne peuvent donc plus diverger : modifier un contrat sans son test ne
compile pas, modifier une réponse sans son contrat fait échouer le test.

**Lancer en local** (base jetable, jamais la base de développement) :

```bash
# 1. Une base PostgreSQL jetable sur le port 5433
docker run -d --name bmad-contract-db -e POSTGRES_DB=bons_contract -e POSTGRES_USER=app \
  -e POSTGRES_PASSWORD=contract -e TZ=UTC -p 127.0.0.1:5433:5432 postgres:16-alpine

# 2. La suite (applique les migrations, puis chaque fichier vide et remplit la base)
cd backend
CONTRACT_DATABASE_URL=postgresql://app:contract@127.0.0.1:5433/bons_contract npm run test:contract
# PowerShell : $env:CONTRACT_DATABASE_URL = "postgresql://app:contract@127.0.0.1:5433/bons_contract"; npm run test:contract

# Un seul fichier
CONTRACT_DATABASE_URL=… npm run test:contract -- test/contract/equipment.contract.ts

# 3. Nettoyer
docker rm -f bmad-contract-db
```

Compter environ deux minutes pour la suite complète. `CONTRACT_LOGS=1` affiche les journaux d'erreur de
l'application pour enquêter sur un échec.

**Garde-fous.**

- La suite ne lit jamais `DATABASE_URL` (qui vise la base de développement via `backend/.env`) mais
  `CONTRACT_DATABASE_URL`, et refuse toute base dont le nom ne contient pas `contract` (seul le nom de
  la base compte, pas l'utilisateur, l'hôte ni les paramètres). Une `DATABASE_URL` héritée de
  l'environnement est remplacée avant le chargement de l'application. Avant le moindre hook de
  démarrage, elle revérifie auprès de PostgreSQL (`current_database()`) le nom de la base réellement
  connectée. Ces règles sont testées par `npm test` (`test/contract/support/__tests__/database.spec.ts`).
- Les fichiers écrits par l'application (signatures, pièces jointes, logos) vont dans un dossier
  temporaire, jamais dans `backend/data`.
- `npm test` ne voit pas ces fichiers (suffixe `.contract.ts`, configuration
  `test/contract/vitest.contract.config.ts`) : il n'a besoin d'aucune base.

**En CI** (job `backend` de `.github/workflows/docker.yml`) :

- « Contrats partagés à jour » régénère `frontend/src/contracts/` et échoue si la copie versionnée diffère
  (fichier modifié, ajouté ou supprimé) ;
- « Contrat HTTP » lance la suite sur la base `bons_contract` du service Postgres de la CI.

**Ajouter ou modifier une route appelée par le front.**

1. Déclarer ou corriger le type de la réponse dans `backend/src/contracts/<domaine>.ts`.
2. Écrire la forme correspondante dans `backend/test/contract/shapes/<domaine>.ts`.
3. Ajouter la règle d'accès dans le tableau `ACCESS` du fichier de contrat, puis un test de la réponse
   (données du jeu `support/seed*.ts`, complété si la liste serait vide : `arrayOf(…, { minLength: 1 })`
   refuse de valider une liste vide).
4. Lancer `npm run sync-contracts` dans `backend/` et versionner les deux dossiers de contrats.

**Même configuration que la production.** La configuration HTTP (préfixe `/api`, proxy de confiance,
taille des corps, cookies, en-têtes de sécurité, protection CSRF, CORS, `ValidationPipe`, filtre
d'erreurs) vit dans une seule fonction, `configureApp` (`backend/src/bootstrap/configure-app.ts`),
appelée par `main.ts` et par `test/contract/support/app.ts`. Un réglage qui change les réponses s'y
ajoute : les tests de contrat le voient alors sans rien recopier. Son comportement est aussi vérifié
sans base par `src/bootstrap/__tests__/configure-app.spec.ts`.
