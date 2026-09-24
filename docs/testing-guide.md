# Guide de Tests — Bons de Mise a Disposition

> Guide pratique pour ecrire et executer les tests du projet. Destine a l'equipe IT et aux sessions Claude Code.

---

## Table des matieres

1. [Strategie de test](#1-strategie-de-test)
2. [Tests backend](#2-tests-backend)
3. [Tests frontend (futur)](#3-tests-frontend-futur)
4. [Objectifs de couverture](#4-objectifs-de-couverture)
5. [Tests existants](#5-tests-existants)
6. [Priorites de test](#6-priorites-de-test)
7. [Tests E2E](#7-tests-e2e)

---

## 1. Strategie de test

Le projet suit une approche de test en trois couches :

| Couche | Outil | Scope | Statut |
|--------|-------|-------|--------|
| **Tests unitaires** | Vitest + @nestjs/testing | Services, utilitaires, validation | Actif |
| **Tests d'integration** | Vitest + base reelle (Docker) | Endpoints API avec PostgreSQL | Futur |
| **Tests E2E** | Playwright + Docker Compose | Parcours utilisateur complets | Actif (`e2e/`) |

### Principes

- Les **tests unitaires** mockent toutes les dependances externes (BDD, SMTP, LDAP, SMB).
- Les **tests d'integration** utiliseront une base PostgreSQL ephemere via Docker.
- Les **tests E2E** couvrent les flux critiques : creation de bon, cachet IT, envoi par email,
  signature (email et presentielle), restitution, non-rendu et PV de cloture, inventaire. Voir
  section 7.
- Objectif global : **80% de couverture** sur le backend.

---

## 2. Tests backend

### 2.1 Framework et configuration

| Element | Valeur |
|---------|--------|
| Runner | Vitest 4 (depuis le 24/09/2026 ; Jest auparavant) |
| Transform | SWC via `unplugin-swc` (emet les metadonnees de decorateurs dont depend l'injection NestJS) |
| Module testing | @nestjs/testing |
| Config | `backend/vitest.config.ts` |
| Pattern de nommage | `*.spec.ts` |
| Emplacement | Dossiers `__tests__/` a cote des sources |
| Couverture | `@vitest/coverage-v8`, seuils dans `vitest.config.ts` (cliquet 65/72/80/80) |

Pourquoi Vitest : depuis NestJS 12, les paquets `@nestjs/*` sont publies en ESM pur. Jest execute
tout en CommonJS avec son propre chargeur ; il fallait retranscrire NestJS avec Babel et remplacer un
de ses fichiers internes par une doublure. Vitest laisse Node charger `node_modules` : les tests
executent le vrai code de NestJS, comme la production. Le build de production (`nest build`, CommonJS)
n'a pas change.

Ce qui change par rapport a Jest :

- `vi` remplace `jest` : `vi.fn()`, `vi.spyOn()`, `vi.mock()`, `vi.useFakeTimers()`… Les globales
  (`describe`, `it`, `expect`, `vi`) restent disponibles sans import dans les `*.spec.ts`
  (types : `backend/test/vitest-globals.d.ts`). Les types s'importent : `import type { Mock } from 'vitest'`.
- Les utilitaires de test qui ne sont pas des `*.spec.ts` (`common/__tests__/helpers`, fixtures) sont
  compiles par `nest build` : ils importent `vi` explicitement (`import { vi } from 'vitest'`).
- Les tests s'executent en ESM : pas de `require()` d'un module simule. Pour manipuler un module
  remplace par `vi.mock('fs/promises', …)`, l'importer normalement (`import * as fsp from 'fs/promises'`) :
  l'import recoit la doublure. Pour garder le reste du vrai module :
  `vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('fs')>()), existsSync: vi.fn() }))`.
- Un module CommonJS dont l'export est lui-meme une classe ou une fonction (`module.exports = X`,
  ex. `pdfkit`) s'importe avec `import X = require('x')`, pas `import * as X` (un espace de noms ESM
  n'est pas constructible). La compilation de production est identique.
- `di-metadata.spec.ts` et `import-order.spec.ts` (garde-fous contre les cycles d'import qui ont deja
  casse la production) ne passent pas par Vitest pour charger le code : ils lancent un processus Node
  neuf qui compile les sources avec le compilateur TypeScript (programme complet de
  `tsconfig.build.json`, comme `nest build`) et les charge par `require()`
  (`backend/test/helpers/production-load-report.cjs`). Une transpilation fichier par fichier, ou SWC,
  remplacerait l'`undefined` d'un cycle par `Object` et rendrait ces garde-fous aveugles.

### 2.2 Commandes d'execution

```bash
cd backend

# Lancer tous les tests
npm test

# Mode watch (relance a chaque modification)
npm run test:watch

# Rapport de couverture avec seuils (HTML dans ./coverage/index.html)
npm run test:cov

# Lancer les fichiers dont le chemin contient « bons »
npx vitest run bons

# Lancer un fichier de test precis
npx vitest run src/auth/__tests__/auth-security.spec.ts

# Mode verbose (detail de chaque test)
npx vitest run --reporter=verbose

# Suites sur base reelle (base lancee, migrations appliquees ; fichiers executes
# l'un apres l'autre, voir vitest.config.ts)
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

### 2.3 Pattern NestJS TestingModule

Chaque service NestJS depend d'autres services injectes via le constructeur. Dans les tests, on remplace ces dependances par des mocks.

#### Exemple complet : tester `BonsService`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BonsService } from '../bons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureService } from '../../signature/signature.service';
import { NotificationService } from '../../notification/notification.service';
import { PdfService } from '../../pdf/pdf.service';
import { SmbService } from '../../smb/smb.service';

describe('BonsService', () => {
  let service: BonsService;
  let mockPrisma: Mocked<Record<string, any>>;

  beforeEach(async () => {
    // Mock PrismaService avec tous les modeles utilises
    mockPrisma = {
      bon: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        deleteMany: vi.fn(),
      },
      signature: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      filiale: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    const mockSignatureService = {
      generateToken: vi.fn(),
      getSignatureImages: vi.fn(),
    };

    const mockNotificationService = {
      sendBonNotification: vi.fn(),
    };

    const mockPdfService = {
      generateMiseDisposition: vi.fn(),
      generateRestitution: vi.fn(),
    };

    const mockSmbService = {
      uploadPdf: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BonsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SignatureService, useValue: mockSignatureService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: PdfService, useValue: mockPdfService },
        { provide: SmbService, useValue: mockSmbService },
      ],
    }).compile();

    service = module.get<BonsService>(BonsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated bons', async () => {
      const mockBons = [{ id: 'bon-1', reference: 'BMD-2026-001', status: 'draft' }];
      mockPrisma.bon.findMany.mockResolvedValue(mockBons);
      mockPrisma.bon.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(mockPrisma.bon.findMany).toHaveBeenCalled();
      expect(result.data).toEqual(mockBons);
      expect(result.total).toBe(1);
    });
  });
});
```

#### Exemple : tester `ContestationService`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ContestationService } from '../contestation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { SignatureService } from '../../signature/signature.service';

describe('ContestationService', () => {
  let service: ContestationService;
  let mockPrisma: Mocked<Record<string, any>>;

  beforeEach(async () => {
    mockPrisma = {
      bon: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      contestation: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContestationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: { sendContestationNotification: vi.fn() } },
        { provide: SignatureService, useValue: { generateToken: vi.fn() } },
      ],
    }).compile();

    service = module.get<ContestationService>(ContestationService);
  });

  it('should throw NotFoundException when bon does not exist', async () => {
    mockPrisma.bon.findUnique.mockResolvedValue(null);
    await expect(service.create('non-existent', 'user-1', 'message'))
      .rejects.toThrow('Bon introuvable');
  });
});
```

### 2.4 Strategie de mock

#### PrismaService

Le PrismaService etend PrismaClient. Dans les tests, on le remplace par un objet plain contenant des mocks pour chaque modele Prisma utilise par le service teste.

```typescript
// Modeles frequemment mockes
const mockPrisma = {
  bon: { findMany, findUnique, create, update, count, deleteMany },
  user: { findUnique, findMany, update, count },
  signature: { findFirst, findMany, create, update, deleteMany },
  equipment: { findMany, create, update, delete, deleteMany },
  contestation: { create, findMany, update },
  filiale: { findMany, findUnique },
  notification: { create, findMany, update, updateMany, count },
  auditLog: { create },
  appConfig: { findFirst, findUnique, upsert },
  $transaction: vi.fn((callback) => callback(mockPrisma)),
};
```

**Important** : Le mock `$transaction` doit executer le callback en passant le mock lui-meme comme argument, car Prisma fournit un client transactionnel au callback :

```typescript
// CORRECT : execute le callback avec le mock client
$transaction: vi.fn((cb) => cb(mockPrisma)),

// INCORRECT : ne retourne rien
$transaction: vi.fn(),
```

#### Services externes (jamais d'appel reel)

| Service | Pourquoi mocker | Methodes principales |
|---------|----------------|---------------------|
| **NotificationService** (SMTP) | Pas de serveur mail en test | `sendBonNotification`, `sendContestationNotification` |
| **LdapService** | Pas d'Active Directory en test | `ldap-search.ts`, `ldap-user-upsert.ts` |
| **SmbService** | Pas de partage reseau en test | `uploadPdf`, `fileExists` |
| **PdfService** (pdfkit) | Lent et produit des binaires | `generateMiseDisposition`, `generateRestitution` |

#### EncryptionService et ConfigService

```typescript
const mockEncryption = {
  encrypt: vi.fn((val: string) => `encrypted:${val}`),
  decrypt: vi.fn((val: string) => val.replace('encrypted:', '')),
};

const mockConfigService = {
  get: vi.fn((category: string, key: string) => {
    const defaults: Record<string, string> = {
      'smtp:host': 'localhost',
      'smtp:port': '587',
      'app:base_url': 'http://localhost:3000',
    };
    return defaults[`${category}:${key}`] ?? null;
  }),
};
```

### 2.5 Fixtures

Les fixtures fournissent des objets pre-construits pour eviter la duplication de donnees de test.

**Emplacement** : `backend/src/common/__tests__/fixtures/`

#### `bon.fixtures.ts`

```typescript
import { v4 as uuid } from 'uuid';

const BASE_FILIALE = {
  id: uuid(),
  name: 'demo',
  displayName: 'Filiale Demo',
  logoPath: null,
  stampPath: null,
  address: '123 rue Exemple',
  siret: '12345678901234',
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const BASE_USER = {
  id: uuid(),
  displayName: 'Jean Dupont',
  email: 'jean.dupont@exemple.fr',
};

const BASE_BON = {
  id: uuid(),
  reference: 'BMD-2026-001',
  filialeId: BASE_FILIALE.id,
  collaborateurId: uuid(),
  collaborateurEmail: 'collab@exemple.fr',
  createdById: BASE_USER.id,
  civilite: 'M.',
  notes: null,
  dateMiseDisposition: new Date('2026-03-01'),
  dateRestitution: null,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
  filiale: BASE_FILIALE,
  collaborateur: { id: uuid(), displayName: 'Paul Martin', email: 'paul@exemple.fr', department: 'IT' },
  createdBy: BASE_USER,
  equipments: [],
  signatures: [],
};

// Bons dans differents etats du workflow
export const BON_DRAFT = { ...BASE_BON, status: 'draft' };
export const BON_SENT = { ...BASE_BON, id: uuid(), status: 'sent_mise_dispo' };
export const BON_ACTIVE = { ...BASE_BON, id: uuid(), status: 'active' };
export const BON_CONTESTED = { ...BASE_BON, id: uuid(), status: 'contested' };
export const BON_PARTIALLY_RETURNED = { ...BASE_BON, id: uuid(), status: 'partially_returned' };
export const BON_ARCHIVED = { ...BASE_BON, id: uuid(), status: 'archived', dateRestitution: new Date() };
export const BON_CANCELLED = { ...BASE_BON, id: uuid(), status: 'cancelled' };
```

#### `user.fixtures.ts`

```typescript
import { v4 as uuid } from 'uuid';

export const ADMIN_USER = {
  id: uuid(),
  samAccountName: 'admin.test',
  displayName: 'Admin Test',
  email: 'admin@exemple.fr',
  role: 'admin',
  isItStaff: true,
  filialeId: null,
  active: true,
};

export const TECHNICIAN_USER = {
  id: uuid(),
  samAccountName: 'tech.test',
  displayName: 'Technicien Test',
  email: 'tech@exemple.fr',
  role: 'technician',
  isItStaff: true,
  filialeId: 'filiale-1',
  active: true,
};

export const COLLABORATOR_USER = {
  id: uuid(),
  samAccountName: 'collab.test',
  displayName: 'Collaborateur Test',
  email: 'collab@exemple.fr',
  role: 'collaborator',
  isItStaff: false,
  filialeId: 'filiale-1',
  active: true,
};
```

### 2.6 Patterns de test recommandes

#### Tester les transitions d'etat (machine a etats des bons)

```typescript
describe('Status transitions', () => {
  it('should transition from draft to sent_mise_dispo on send', async () => {
    mockPrisma.bon.findUnique.mockResolvedValue(BON_DRAFT);
    mockPrisma.bon.update.mockResolvedValue({ ...BON_DRAFT, status: 'sent_mise_dispo' });

    const result = await service.send(BON_DRAFT.id, ADMIN_USER.id);

    expect(mockPrisma.bon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BON_DRAFT.id },
        data: expect.objectContaining({ status: 'sent_mise_dispo' }),
      }),
    );
    expect(result.status).toBe('sent_mise_dispo');
  });

  it('should reject invalid transition from archived to active', async () => {
    mockPrisma.bon.findUnique.mockResolvedValue(BON_ARCHIVED);

    await expect(service.send(BON_ARCHIVED.id, ADMIN_USER.id))
      .rejects.toThrow(BadRequestException);
  });
});
```

#### Tester les erreurs et cas limites

```typescript
describe('Error handling', () => {
  it('should throw NotFoundException for non-existent bon', async () => {
    mockPrisma.bon.findUnique.mockResolvedValue(null);

    await expect(service.findById('non-existent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException for unauthorized access', async () => {
    mockPrisma.bon.findUnique.mockResolvedValue(BON_ACTIVE);

    await expect(service.contest(BON_ACTIVE.id, 'wrong-user-id', 'motif'))
      .rejects.toThrow(ForbiddenException);
  });
});
```

#### Tester les fonctions utilitaires pures (sans TestingModule)

Pour les fonctions pures comme `escapeHtml`, pas besoin de NestJS TestingModule :

```typescript
describe('escapeHtml', () => {
  it('should escape script tags', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('should preserve safe strings', () => {
    expect(escapeHtml('Lenovo ThinkBook 16 G6'))
      .toBe('Lenovo ThinkBook 16 G6');
  });
});
```

---

## 3. Tests frontend (futur)

> Non encore implemente. Plan prevu ci-dessous.

### 3.1 Framework cible

| Element | Choix |
|---------|-------|
| Runner | Vitest (integre a Vite) |
| DOM | @testing-library/react |
| API mocking | MSW (Mock Service Worker) |
| Config | `vite.config.ts` (section `test`) |
| Setup | `src/test/setup.ts` |

### 3.2 Installation des dependances

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event msw jsdom
```

### 3.3 Configuration Vitest

Ajouter dans `vite.config.ts` :

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
```

### 3.4 Setup file (`src/test/setup.ts`)

```typescript
import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 3.5 MSW (Mock Service Worker)

Les handlers MSW interceptent les appels API pendant les tests pour retourner des donnees controlees.

`src/test/handlers.ts` :

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/bons', () => {
    return HttpResponse.json({
      data: [
        { id: '1', reference: 'BMD-2026-001', status: 'draft' },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });
  }),

  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      id: 'user-1',
      displayName: 'Admin Test',
      role: 'admin',
    });
  }),
];
```

`src/test/server.ts` :

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

### 3.6 Exemple de test de composant

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BonsList } from '../BonsList';

describe('BonsList', () => {
  it('should render the list of bons', async () => {
    render(
      <MemoryRouter>
        <BonsList />
      </MemoryRouter>
    );

    expect(await screen.findByText('BMD-2026-001')).toBeInTheDocument();
  });
});
```

---

## 4. Objectifs de couverture

| Cible | Couverture minimale | Commentaire |
|-------|-------------------|-------------|
| **Services backend** | 80% | Logique metier critique |
| **Controllers backend** | 70% | Principalement delegation vers services |
| **Guards / Pipes** | 80% | Securite, validation |
| **Backend global** | 80% | Mesure par `npm run test:cov` |
| **Frontend (initial)** | 60% | Cible a augmenter progressivement |

Pour generer le rapport de couverture :

```bash
cd backend
npm run test:cov

# Le rapport HTML est dans backend/coverage/index.html
```

---

## 5. Tests existants

### Tableau de bord KPI et rôle Direction (2026-09-17)

Suite ajoutée avec le tableau de bord KPI et le rôle Direction. Backend :

| Fichier | Ce qui est vérifié |
|---------|---------------------|
| `backend/src/common/__tests__/bon-predicates.spec.ts` | Prédicats métier partagés (retard de signature, équipement prêté), `CATEGORY_LABELS`, `escapeCsvCell` |
| `backend/src/common/__tests__/roles.spec.ts` | `isItRole()` sur chaque rôle |
| `backend/src/auth/guards/__tests__/roles.guard.spec.ts` | Garde RBAC, y compris le rôle `direction` |
| `backend/src/admin/__tests__/admin.controller.spec.ts` | Clés de config `entra.direction_group_id`/`rappels.signature_overdue_days`, `PATCH users/:id/role`, `GET notifications/failed` |
| `backend/src/kpi/__tests__/kpi-period.spec.ts` | Période par défaut, période précédente, granularité aux bornes 31/32 et 182/183 jours, buckets, `fillSeries`, rejets (`from > to`, date invalide, écart > 731 j) |
| `backend/src/kpi/__tests__/kpi-sql.spec.ts` | Fragments SQL communs (bornes de période en UTC naïf, filtre filiale) |
| `backend/src/kpi/__tests__/kpi-cache.service.spec.ts` | TTL 60 s, dédoublonnage des promesses en vol, éviction |
| `backend/src/kpi/__tests__/kpi.controller.spec.ts` | Rôles autorisés (`@Roles`), construction de la clé de cache |
| `backend/src/kpi/__tests__/kpi-parc.service.spec.ts`, `kpi-delais.service.spec.ts`, `kpi-incidents.service.spec.ts` | Un spec par service d'onglet (voir pattern ci-dessous) |

Frontend :

| Fichier | Ce qui est vérifié |
|---------|---------------------|
| `frontend/src/components/dashboard/__tests__/StatCard.test.tsx` | Delta (positif/négatif/inversé), valeur nulle, format pourcentage |
| `frontend/src/components/dashboard/charts/__tests__/charts.test.tsx` | `TimeSeriesChart`, `DonutChart`, `HorizontalBars` (avec `ResponsiveContainer` mocké) |
| `frontend/src/hooks/__tests__/use-api-resource.test.ts` | Anti-course (seule la dernière requête émise met à jour l'état) |
| `frontend/src/pages/dashboard/__tests__/DashboardPage.test.tsx` | Onglets affichés selon le rôle, sélection via `?tab=` |
| `frontend/src/pages/dashboard/__tests__/PeriodSelector.test.tsx` | Écriture des presets de période dans l'URL |
| `frontend/src/pages/dashboard/tabs/__tests__/{TodayTab,ParcTab,DelaisTab,IncidentsTab}.test.tsx` | Appel API avec `from`/`to`/`filialeId`, rendu des tuiles/graphiques, état d'erreur avec Réessayer |
| `frontend/src/components/layout/__tests__/Sidebar.test.tsx` | Navigation réduite pour la vue direction (Tableau de bord, Inventaire), badge contestations pour la vue technicien |
| `frontend/src/pages/__tests__/App.direction.test.tsx` | Redirection `/` → tableau de bord (onglet Parc) pour direction, accès refusé sur `/bons`, redirection `/admin/reports` |
| `frontend/src/pages/admin/__tests__/Utilisateurs.test.tsx` | Sélecteur de rôle réservé à l'admin, désactivé sur sa propre ligne, note SSO, `PATCH /admin/users/:id/role` |

#### Pattern : `$queryRaw` mocké par routage sur le texte SQL

Les services KPI enchaînent plusieurs requêtes `Prisma.sql` distinctes sur le même
`$queryRaw`. Plutôt que de mocker par ordre d'appel (fragile dès qu'une requête est
ajoutée/réordonnée), chaque test route la réponse simulée sur un fragment de texte unique
présent dans le SQL généré, et distingue période courante/précédente par la présence de la date
`from` de la période précédente parmi les valeurs liées :

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

Chaque spec vérifie ensuite, sur le texte SQL collecté (`prisma.$queryRaw.mock.calls`), la
présence des casts non négociables plutôt que de recalculer le SQL attendu :

```typescript
expect(calls.some((sql) => sql.includes('b.status::text IN ('))).toBe(true);
expect(calls.some((sql) => sql.includes('ec.category::text'))).toBe(true);
expect(sql).not.toMatch(/b\.status\s+(NOT\s+)?IN\s*\(/); // jamais de comparaison enum sans cast
```

Cette assertion sur le texte SQL (plutôt que sur le résultat renvoyé) est ce qui aurait
détecté le bug réel `operator does not exist: "BonStatus" = text` avant qu'il n'atteigne la
production (commit `a19ea00`).

### `backend/src/auth/__tests__/auth-security.spec.ts`

**19 tests** couvrant la securite de l'authentification :

| Groupe | Tests | Ce qui est verifie |
|--------|-------|--------------------|
| JWT Token Blacklist | 5 | Revocation, cleanup, hachage SHA-256 |
| Default Admin Password | 3 | Lecture env, generation aleatoire, unicite |
| Password Strength Validation | 8+3 | Longueur min/max, majuscule, minuscule, chiffre, caractere special |

### `backend/src/notification/__tests__/email-xss.spec.ts`

**13 tests** couvrant la prevention XSS dans les templates email :

| Groupe | Tests | Ce qui est verifie |
|--------|-------|--------------------|
| escapeHtml | 6 | Tags, entites, guillemets, chaines vides, chaines sures |
| buildEquipList XSS | 4 | customLabel, serialNumber, catalogItem, donnees normales |
| buildNotReturnedList XSS | 3 | notReturnedReason, champs multiples, raison par defaut |
| Template variables | 3 (dans le meme fichier) | COLLAB_NAME, FILIALE_NOM, caracteres accentues |

---

## 6. Priorites de test

Ordre d'implementation recommande, base sur la criticite metier et la complexite :

| Priorite | Service | Fichier source | Focus principal | Dependances a mocker |
|----------|---------|---------------|-----------------|---------------------|
| **P1** | `BonsService` | `src/bons/bons.service.ts` | Machine a etats (draft, sent, active, archived, contested, cancelled), CRUD, pagination, stats | PrismaService, SignatureService, NotificationService, PdfService, SmbService |
| **P2** | `SignatureService` | `src/signature/signature.service.ts` | Cycle de vie des tokens, signature, idempotence, expiration | PrismaService, EncryptionService, PdfService, SmbService |
| **P3** | `AuthService` | `src/auth/auth.service.ts` | Login, refresh token, revocation, blacklist JWT | PrismaService, JwtService, ConfigService |
| **P4** | `NotificationService` | `src/notification/notification.service.ts` | Templates email, cron de relance, XSS prevention | AppConfigService, PrismaService, TemplatesService |
| **P5** | `ContestationService` | `src/contestation/contestation.service.ts` | Creation, resolution, restauration du statut precedent | PrismaService, NotificationService, SignatureService |
| **P6** | `EquipmentService` | `src/equipment/equipment.service.ts` | CRUD, packs, soft delete, catalogue | PrismaService |
| **P7** | `PdfService` | `src/pdf/pdf.service.ts` | Generation PDF, snapshots, formatage | PrismaService (pour les donnees), pdfkit (mock partiel) |
| **P8** | `LdapService` | `src/ldap/ldap.service.ts` | Validation des filtres, synchronisation utilisateurs | ldapjs (mock complet) |

### Checklist par service

Pour chaque service, verifier :

- [ ] Tous les cas nominaux (happy path)
- [ ] Toutes les transitions d'etat valides
- [ ] Les transitions invalides (doivent lever une exception)
- [ ] Les entites inexistantes (`NotFoundException`)
- [ ] Les acces non autorises (`ForbiddenException`)
- [ ] Les donnees invalides (`BadRequestException`)
- [ ] Le comportement du `$transaction` (rollback implicite en cas d'erreur)
- [ ] Les cas limites : listes vides, pagination hors bornes, champs optionnels null

---

## 7. Tests E2E

Suite Playwright dans `e2e/`, exécutée à chaque push par le job `e2e` de la CI. Elle joue l'application
réellement construite depuis les sources (mêmes Dockerfiles qu'en production), contre une base et un serveur
d'emails jetables.

Ces tests existent parce qu'une suite unitaire ne les remplace pas : la régression « cachet IT refusé sur un
brouillon », qui rendait tout envoi impossible depuis l'interface, n'a été vue que par un parcours navigateur.

### 7.1 Ce qui est couvert

| Fichier | Parcours |
|---------|----------|
| `tests/auth.setup.ts` | Connexion locale de l'administrateur, changement de mot de passe imposé, session réutilisée par les autres tests |
| `tests/02-envoi-email.spec.ts` | Création d'un bon, cachet IT, envoi : l'email de demande de signature arrive avec son lien |
| `tests/03-presentiel-signature.spec.ts` | Signature en présentiel jusqu'au bon actif et au PDF disponible |
| `tests/04-sans-adresse.spec.ts` | Collaborateur sans adresse : envoi par email refusé avec la bonne explication, présentiel possible |
| `tests/05-restitution-non-rendu.spec.ts` | Restitution partielle, équipement déclaré non rendu, PV de clôture, archivage |
| `tests/06-inventaire-par-collaborateur.spec.ts` | Vue « Par collaborateur » de l'inventaire : la personne apparaît avec son matériel |
| `tests/07-restitution-sans-adresse.spec.ts` | Collaborateur sans adresse : restitution par email refusée, le bon reste actif |
| `tests/08-portail-collaborateur.spec.ts` | Portail `/mes-bons`, côté collaborateur connecté : il voit son bon, l'ouvre, télécharge le PDF ; le bon d'un autre n'apparaît pas et son adresse directe est refusée (« Accès refusé à ce bon ») |
| `tests/09-contestation.spec.ts` | Le collaborateur conteste depuis le portail ; l'IT voit le badge du menu, traite la contestation dans Admin → Contestations (rejet avec réponse) ; le collaborateur retrouve son bon actif et reçoit l'email de réponse (Mailpit) |
| `tests/10-fiche-materiel.spec.ts` | Depuis l'inventaire, le n° de série puis le n° d'inventaire ouvrent la fiche `/materiel/:reference`, qui nomme le détenteur actuel |
| `tests/11-creation-rapide.spec.ts` | Création rapide : date du jour pré-remplie, filiale remplie par le choix du collaborateur, n° de série déjà en circulation signalé à la sortie du champ, Entrée dans « N° Série » ajoute une ligne sans soumettre |
| `tests/12-signature-mobile.spec.ts` | Signature présentielle au doigt sur téléphone (390 × 844, tactile) : le bon devient actif |

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
  frontend reconnaît). Le backend plafonne certaines routes par adresse (cachet IT : 10 par minute) : en CI,
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

## Annexe : Carte des dependances des services

Utile pour savoir quoi mocker lors de l'ecriture des tests :

```
BonsService
  ├── PrismaService
  ├── SignatureService
  │     ├── PrismaService
  │     ├── EncryptionService
  │     ├── PdfService
  │     └── SmbService
  ├── NotificationService
  │     ├── AppConfigService
  │     ├── PrismaService
  │     └── TemplatesService
  ├── PdfService
  └── SmbService

ContestationService
  ├── PrismaService
  ├── NotificationService
  └── SignatureService

AuthService
  ├── PrismaService
  ├── JwtService
  └── AppConfigService

EquipmentService
  └── PrismaService

LdapService
  ├── PrismaService
  └── AppConfigService
```

> **Note** : Chaque service ne doit mocker que ses dependances **directes**. `BonsService` mocke `SignatureService`, pas les sous-dependances de `SignatureService`.
