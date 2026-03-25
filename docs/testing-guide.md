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
7. [Tests E2E (futur)](#7-tests-e2e-futur)

---

## 1. Strategie de test

Le projet suit une approche de test en trois couches :

| Couche | Outil | Scope | Statut |
|--------|-------|-------|--------|
| **Tests unitaires** | Jest + @nestjs/testing | Services, utilitaires, validation | Actif |
| **Tests d'integration** | Jest + base reelle (Docker) | Endpoints API avec PostgreSQL | Futur |
| **Tests E2E** | Playwright + Docker Compose | Parcours utilisateur complets | Futur |

### Principes

- Les **tests unitaires** mockent toutes les dependances externes (BDD, SMTP, LDAP, SMB).
- Les **tests d'integration** utiliseront une base PostgreSQL ephemere via Docker.
- Les **tests E2E** couvriront les flux critiques : creation de bon, envoi, signature, archivage.
- Objectif global : **80% de couverture** sur le backend.

---

## 2. Tests backend

### 2.1 Framework et configuration

| Element | Valeur |
|---------|--------|
| Runner | Jest 30.3 |
| Transform | ts-jest |
| Module testing | @nestjs/testing |
| Config | `backend/jest.config.js` |
| Pattern de nommage | `*.spec.ts` |
| Emplacement | Dossiers `__tests__/` a cote des sources |

Configuration Jest (`backend/jest.config.js`) :

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};
```

### 2.2 Commandes d'execution

```bash
cd backend

# Lancer tous les tests
npm test

# Mode watch (relance a chaque modification)
npm test -- --watch

# Rapport de couverture (HTML dans ./coverage)
npm run test:cov

# Lancer les tests d'un service specifique
npm test -- --testPathPattern=bons

# Lancer un fichier de test precis
npm test -- --testPathPattern=auth-security

# Mode verbose (detail de chaque test)
npm test -- --verbose
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
  let mockPrisma: jest.Mocked<Record<string, any>>;

  beforeEach(async () => {
    // Mock PrismaService avec tous les modeles utilises
    mockPrisma = {
      bon: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      signature: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      filiale: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    const mockSignatureService = {
      generateToken: jest.fn(),
      getSignatureImages: jest.fn(),
    };

    const mockNotificationService = {
      sendBonNotification: jest.fn(),
    };

    const mockPdfService = {
      generateMiseDisposition: jest.fn(),
      generateRestitution: jest.fn(),
    };

    const mockSmbService = {
      uploadPdf: jest.fn(),
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
  let mockPrisma: jest.Mocked<Record<string, any>>;

  beforeEach(async () => {
    mockPrisma = {
      bon: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      contestation: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContestationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: { sendContestationNotification: jest.fn() } },
        { provide: SignatureService, useValue: { generateToken: jest.fn() } },
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
  $transaction: jest.fn((callback) => callback(mockPrisma)),
};
```

**Important** : Le mock `$transaction` doit executer le callback en passant le mock lui-meme comme argument, car Prisma fournit un client transactionnel au callback :

```typescript
// CORRECT : execute le callback avec le mock client
$transaction: jest.fn((cb) => cb(mockPrisma)),

// INCORRECT : ne retourne rien
$transaction: jest.fn(),
```

#### Services externes (jamais d'appel reel)

| Service | Pourquoi mocker | Methodes principales |
|---------|----------------|---------------------|
| **NotificationService** (SMTP) | Pas de serveur mail en test | `sendBonNotification`, `sendContestationNotification` |
| **LdapService** | Pas d'Active Directory en test | `searchUsers`, `syncUser` |
| **SmbService** | Pas de partage reseau en test | `uploadPdf`, `fileExists` |
| **PdfService** (pdfkit) | Lent et produit des binaires | `generateMiseDisposition`, `generateRestitution` |

#### EncryptionService et ConfigService

```typescript
const mockEncryption = {
  encrypt: jest.fn((val: string) => `encrypted:${val}`),
  decrypt: jest.fn((val: string) => val.replace('encrypted:', '')),
};

const mockConfigService = {
  get: jest.fn((category: string, key: string) => {
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
  name: 'livio',
  displayName: 'Groupe Livio',
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
  email: 'jean.dupont@livio.fr',
};

const BASE_BON = {
  id: uuid(),
  reference: 'BMD-2026-001',
  filialeId: BASE_FILIALE.id,
  collaborateurId: uuid(),
  collaborateurEmail: 'collab@livio.fr',
  createdById: BASE_USER.id,
  civilite: 'M.',
  notes: null,
  dateMiseDisposition: new Date('2026-03-01'),
  dateRestitution: null,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
  filiale: BASE_FILIALE,
  collaborateur: { id: uuid(), displayName: 'Paul Martin', email: 'paul@livio.fr', department: 'IT' },
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
  email: 'admin@livio.fr',
  role: 'admin',
  isItStaff: true,
  filialeId: null,
  active: true,
};

export const TECHNICIAN_USER = {
  id: uuid(),
  samAccountName: 'tech.test',
  displayName: 'Technicien Test',
  email: 'tech@livio.fr',
  role: 'technician',
  isItStaff: true,
  filialeId: 'filiale-1',
  active: true,
};

export const COLLABORATOR_USER = {
  id: uuid(),
  samAccountName: 'collab.test',
  displayName: 'Collaborateur Test',
  email: 'collab@livio.fr',
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

# Le rapport HTML est dans backend/coverage/lcov-report/index.html
```

---

## 5. Tests existants

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

## 7. Tests E2E (futur)

> Scope futur. Architecture cible documentee ci-dessous.

### 7.1 Stack cible

| Element | Choix |
|---------|-------|
| Framework | Playwright |
| Infra | Docker Compose (app + PostgreSQL + mailpit) |
| Seed | Script de seed avec fixtures |
| CI | GitHub Actions avec service containers |

### 7.2 Architecture Docker Compose pour les tests

```yaml
# docker-compose.test.yml
services:
  db-test:
    image: postgres:16
    environment:
      POSTGRES_DB: bons_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"

  mailpit:
    image: axllent/mailpit
    ports:
      - "8025:8025"   # UI
      - "1025:1025"   # SMTP

  backend-test:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://test:test@db-test:5432/bons_test
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
    depends_on:
      - db-test
      - mailpit

  frontend-test:
    build: ./frontend
    depends_on:
      - backend-test
```

### 7.3 Seed de la base de test

```typescript
// backend/prisma/seed-test.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedTest() {
  // Creer la filiale de test
  const filiale = await prisma.filiale.create({
    data: {
      name: 'test-filiale',
      displayName: 'Filiale Test',
      address: '1 rue du Test',
      siret: '00000000000000',
    },
  });

  // Creer les utilisateurs de test
  const adminHash = await bcrypt.hash('TestAdmin123!', 12);
  await prisma.user.create({
    data: {
      samAccountName: 'admin.e2e',
      displayName: 'Admin E2E',
      email: 'admin.e2e@test.local',
      role: 'admin',
      isItStaff: true,
      passwordHash: adminHash,
      filialeId: filiale.id,
    },
  });

  // ... autres utilisateurs et donnees
}

seedTest()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });
```

### 7.4 Parcours critiques a tester

| N | Parcours | Etapes |
|---|----------|--------|
| 1 | **Creation et envoi d'un bon** | Login admin, creer bon, ajouter equipements, envoyer |
| 2 | **Signature mise a disposition** | Ouvrir le lien de signature, dessiner la signature, valider |
| 3 | **Cycle complet** | Creer, envoyer, signer mise a dispo, signer restitution, archiver |
| 4 | **Contestation** | Login collaborateur, contester un bon actif, admin resout |
| 5 | **Restitution partielle** | Marquer certains equipements non restitues, generer le PV |
| 6 | **Gestion du catalogue** | Ajouter un equipement au catalogue, creer un bon avec |

### 7.5 Exemple de test Playwright

```typescript
import { test, expect } from '@playwright/test';

test.describe('Bon lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin.e2e');
    await page.fill('[name="password"]', 'TestAdmin123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should create, send, and archive a bon', async ({ page }) => {
    // Creer un bon
    await page.click('text=Nouveau bon');
    await page.selectOption('[name="filialeId"]', { label: 'Filiale Test' });
    // ... remplir le formulaire
    await page.click('text=Enregistrer');

    // Verifier la creation
    await expect(page.locator('.bon-status')).toHaveText('Brouillon');

    // Envoyer
    await page.click('text=Envoyer pour signature');
    await expect(page.locator('.bon-status')).toHaveText('En attente signature');
  });
});
```

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
