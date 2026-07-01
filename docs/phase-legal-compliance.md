# Phases de Conformité Légale — Bons de Mise à Disposition

**Mise à jour** : 31 mars 2026
**Auteur** : Analyse technique — Groupe Livio
**Statut** : Implémentation complète (Phases A, B, C)

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Phase A — Conformité légale (Clauses & Conditions)](#phase-a--conformité-légale-clauses--conditions)
3. [Phase B — Photos d'équipements](#phase-b--photos-déquipements)
4. [Phase C — Améliorations complémentaires](#phase-c--améliorations-complémentaires)
5. [Migrations de base de données](#migrations-de-base-de-données)
6. [Points de vérification](#points-de-vérification)
7. [Prochaines étapes](#prochaines-étapes)

---

## Vue d'ensemble

Les phases A, B et C mettent en œuvre les recommandations de conformité juridique et assurance pour l'application de gestion des bons de mise à disposition. Elles répondent aux lacunes identifiées dans l'analyse juridique initiale :

- **Phase A** : Conditions générales, clauses de responsabilité, mentions légales, versioning des conditions
- **Phase B** : Capture photos des équipements (remise, retour, constat)
- **Phase C** : Données complémentaires (dates d'achat, numéros de police, service de rétention)

---

## Phase A — Conformité légale (Clauses & Conditions)

### A1 — Affichage des conditions sur la page de signature

**Objectif** : Garantir que le collaborateur a lu et accepté les conditions avant signature.

**Implémentation** :

| Composant | Fichier | Modification |
|-----------|---------|--------------|
| **Frontend** | `frontend/src/pages/signature/SignaturePage.tsx` | Bloc `ConditionsDisplay` affichant le texte des conditions dans un scrollable |
| **API** | `backend/src/signature/signature.controller.ts` | Endpoint `GET /api/signature/conditions/:type` |
| **Service** | `backend/src/signature/signature.service.ts` | Récupération des conditions depuis `AppConfig` |

**Flux UX** :
1. Collaborateur ouvre le lien de signature
2. Voir la liste des équipements
3. **BLOC CONDITIONS** : Texte complet des conditions générales (scrollable)
4. Obligation de scroller jusqu'en bas pour activer la checkbox
5. Cocher "Lu et approuvé" → Signature possible
6. Signer sur le canvas
7. Valider

**Code exemple** (`SignaturePage.tsx` lignes 100-109) :
```typescript
// ── 2b. Fetch conditions générales ──
useEffect(() => {
  if (!data) return;
  const sigType = data.signature.type === 'pv_cloture' ? 'pv_cloture'
    : data.signature.type === 'restitution' ? 'restitution' : 'mise_disposition';
  fetch(`/api/signature/conditions/${sigType}`)
    .then((r) => r.ok ? r.json() : { text: null, version: '1' })
    .then((c) => setConditions(c))
    .catch(() => setConditions({ text: null, version: '1' }));
}, [data]);
```

**API Endpoints** :
- `GET /api/signature/conditions/:type` — Retourne `{ text: string, version: string }`
- Types supportés : `mise_disposition`, `restitution`, `pv_cloture`

---

### A2 — Configuration des conditions par l'administrateur

**Objectif** : Permettre à l'administrateur de personnaliser les conditions générales par filiale ou globalement.

**Implémentation** :

| Composant | Fichier | Modification |
|-----------|---------|--------------|
| **Frontend** | `frontend/src/pages/admin/configuration/ConfigConditionsPage.tsx` | Page de configuration CRUD |
| **Backend** | `backend/src/admin/admin.controller.ts` | Endpoints GET/PUT `config/conditions` + `config/conditions/defaults` |
| **Service** | `backend/src/admin/admin.service.ts` | Gestion AppConfig catégorie `conditions` |

**Stockage AppConfig** :

| Clé | Valeur | Exemple |
|-----|--------|---------|
| `conditions:mise_disposition_text` | Texte des conditions de mise à disposition | "Le collaborateur s'engage à..." |
| `conditions:restitution_text` | Texte des conditions de restitution | "La restitution doit se faire en bon état..." |
| `conditions:pv_cloture_text` | Texte du PV équipements non restitués | "Les équipements non restitués demeurent..." |
| `conditions:version` | Numéro de version (pour tracking) | "2" |

**UI Administrateur** (`ConfigConditionsPage.tsx`) :
- Affiche les valeurs par défaut en grisé
- Permet d'éditer chaque condition séparément
- Bouton "Restaurer les défauts"
- Versioning automatique incrémental

**Contrôles d'accès** (`admin.controller.ts` ligne 24) :
```typescript
conditions: ['mise_disposition_text', 'restitution_text', 'pv_cloture_text', 'version'],
```

---

### A3 — Conditions générales dans le PDF

**Objectif** : Inclure les conditions dans le PDF signé pour que le document soit auto-porteur.

**Implémentation** :

| Composant | Fichier | Modification |
|-----------|---------|--------------|
| **Config template** | `backend/src/pdf/pdf-template-config.ts` | Section `legalClauses: { showLegalClauses, title, text }` |
| **Service PDF** | `backend/src/pdf/pdf.service.ts` | Rendu du bloc "Conditions générales" dans le PDF |
| **Service templates** | `backend/src/pdf/pdf-templates.service.ts` | Substitution des variables dans le texte des conditions |

**Configuration du template** (`pdf-template-config.ts`) :
```typescript
export interface PdfLegalClausesConfig {
  showLegalClauses: boolean;
  title: string;
  text: string;
}

export interface PdfTemplateConfig {
  // ...
  legalClauses: PdfLegalClausesConfig;
  // ...
}
```

**Rendu PDF** (`pdf.service.ts` ligne 86-132) :
- Le texte des conditions est récupéré depuis `AppConfig`
- Les variables sont substituées (FILIALE, DATE, etc.)
- Le bloc est rendu avec titre + paragraphes formatés
- Distinct par type de document (mise_disposition, restitution, cloture)

**Défauts** (`pdf-template-config.ts`) :
```typescript
const DEFAULT_CONFIGS = {
  mise_disposition: {
    legalClauses: {
      showLegalClauses: true,
      title: 'CONDITIONS GÉNÉRALES DE MISE À DISPOSITION',
      text: '1. Le collaborateur s\'engage à prendre soin du matériel...'
    }
  }
  // ...
}
```

---

### A4 — Versioning des conditions acceptées

**Objectif** : Tracer la version des conditions que le collaborateur a acceptées.

**Base de données** (`schema.prisma` ligne 266) :
```prisma
model Signature {
  id                String        @id @default(uuid())
  bonId             String        @map("bon_id")
  // ... autres champs ...
  conditionsVersion String?       @map("conditions_version")
  // ...
  @@map("signatures")
}
```

**Migration** (20260331085823_add_legal_compliance_fields.sql) :
```sql
ALTER TABLE "signatures" ADD COLUMN "conditions_version" TEXT;
```

**Stockage lors de la signature** (`signature.service.ts` ligne 117-140) :
```typescript
// Lors du POST /api/signature/:token/sign
const updatedSignature = await this.prisma.signature.update({
  where: { id: sig.id },
  data: {
    signed: true,
    signedAt: new Date(),
    signatureImagePath: relativeImagePath,
    signerEmail: user.email,
    signerIp: extractIp(req),
    signerUserAgent: req.headers['user-agent'],
    mentionLuApprouve: true,
    conditionsVersion: body.conditionsVersion, // Version reçue du frontend
  },
});
```

**Frontend** (`SignaturePage.tsx` ligne 130-138) :
```typescript
const res = await fetch(`/api/signature/${token}/sign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    signatureDataUrl: dataUrl,
    mentionLuApprouve: true,
    conditionsVersion: conditions?.version || undefined,  // Envoyé au backend
  }),
});
```

**Vérification** : Champ visible dans la table `Signature` pour auditer quelles conditions ont été acceptées.

---

### A5 — Mentions distinctes par type de document

**Objectif** : Adapter les mentions IT et collaborateur selon le type de document (mise à disposition vs. restitution vs. PV).

**Configuration** (`pdf-template-config.ts` lignes 54-60) :
```typescript
export interface PdfSignaturesConfig {
  showSignatures: boolean;
  itTitle: string;
  itMention: string;
  collabTitle: string;
  collabMention: string;
}
```

**Défauts par type** :

| Type | IT Mention | Collaborateur Mention |
|------|------------|----------------------|
| **mise_disposition** | "Je certifie avoir remis les équipements ci-dessus en bon état de fonctionnement." | "Je reconnais avoir reçu les équipements listés ci-dessus en bon état." |
| **restitution** | "Je certifie avoir reçu les équipements restitués et en confirme l'état." | "Je reconnais avoir restitué les équipements listés ci-dessus." |
| **cloture** | "Je certifie le constat d'équipements non restitués." | "Je reconnais les équipements non restitués listés ci-dessus." |

**Rendu PDF** : Le template utilise la mention correcte selon le `documentType` passé.

---

### A6 — Champ estimatedValue (valeur estimée)

**Objectif** : Tracer la valeur estimée du matériel pour les déclarations d'assurance.

**Base de données** (`schema.prisma` ligne 202) :
```prisma
model BonEquipment {
  // ... autres champs ...
  estimatedValue    Float?    @map("estimated_value")
  // ...
}
```

**Migration** (20260331085823_add_legal_compliance_fields.sql) :
```sql
ALTER TABLE "bon_equipments" ADD COLUMN "estimated_value" DOUBLE PRECISION;
```

**DTO** (`backend/src/bons/dto/bon.dto.ts` ligne 22) :
```typescript
export class BonEquipmentDto {
  @IsOptional() @IsNumber() @Min(0) estimatedValue?: number;
  // ...
}
```

**Frontend** (`frontend/src/pages/bons/BonCreate.tsx` ligne 48) :
```typescript
interface EquipmentLine {
  _id: string;
  estimatedValue?: number;  // Saisie par utilisateur
  // ...
}
```

**Validation** :
- Optionnel (nullable)
- Positif (Min >= 0)
- Format numérique (Float)

**Utilisation** :
- Affichage dans le détail du bon
- Optionnel dans le PDF (configurable via template)
- Somme totale affichée au dashboard

---

### A7 — Champ returnCondition (état à la restitution)

**Objectif** : Documenter l'état du matériel au moment de la restitution pour tracer les dégradations.

**Base de données** (`schema.prisma` ligne 205) :
```prisma
model BonEquipment {
  // ... autres champs ...
  returnCondition   String?   @map("return_condition")
  // ...
}
```

**Migration** (20260331085823_add_legal_compliance_fields.sql) :
```sql
ALTER TABLE "bon_equipments" ADD COLUMN "return_condition" TEXT;
```

**DTO** (`backend/src/bons/dto/bon.dto.ts` ligne 24) :
```typescript
export class BonEquipmentDto {
  @IsOptional() @IsString() @MaxLength(1000) returnCondition?: string;
  // ...
}
```

**Frontend — Restitution Modal** (`frontend/src/pages/bons/detail/RestitutionModal.tsx` lignes 24, 35-36) :
```typescript
const [conditions, setConditions] = useState<Record<string, string>>({});

const updateCondition = (id: string, value: string) => {
  setConditions((prev) => ({ ...prev, [id]: value }));
};
```

**UI** : Pour chaque équipement sélectionné à la restitution, un champ de texte demande l'état :
- "Bon état"
- "Rayures légères"
- "Clavier défectueux"
- "Écran cassé"
- etc.

**Stockage** : Au moment de l'endpoint `POST /api/bons/:bonId/initiate-restitution` :
```typescript
// Envoyé par le frontend
{
  selectedIds: ['eq1', 'eq2'],
  returnConditions: {
    'eq1': 'Bon état',
    'eq2': 'Écran endommagé'
  }
}

// Storé dans BonEquipment.returnCondition
```

---

### A8 — Section Assurance dans le PDF

**Objectif** : Inclure les informations d'assurance dans le PDF pour informer le collaborateur.

**Configuration** (`pdf-template-config.ts` lignes 73-77) :
```typescript
export interface PdfInsuranceConfig {
  showInsurance: boolean;
  title: string;
  text: string;
}

export interface PdfTemplateConfig {
  // ...
  insurance: PdfInsuranceConfig;
  // ...
}
```

**Rendu PDF** (`pdf.service.ts` ligne 143) :
- Variables substituées : `INSURANCE_POLICY` (numéro de police de la filiale)
- Bloc rendu sous les conditions générales
- Format configurable par template

**Exemple de texte** :
```
COUVERTURE ASSURANCE

Le matériel informatique confié au collaborateur est assuré au titre de la
police multirisque numéro [INSURANCE_POLICY] auprès de [ASSUREUR].

Sont couverts : Vol, casse accidentelle.
Sont exclus : Négligence grave, usage personnel non autorisé, usure normale.

En cas de sinistre, déclarer immédiatement auprès du service informatique.
```

---

## Phase B — Photos d'équipements

### B1 — Table EquipmentPhoto (Base de données)

**Objectif** : Stocker les photos numériques des équipements avec métadonnées.

**Schéma** (`schema.prisma` lignes 214-234) :
```prisma
model EquipmentPhoto {
  id              String        @id @default(uuid())
  bonEquipmentId  String        @map("bon_equipment_id")
  bonEquipment    BonEquipment  @relation(fields: [bonEquipmentId], references: [id], onDelete: Cascade)
  uploadedById    String        @map("uploaded_by_id")
  uploadedBy      User          @relation(fields: [uploadedById], references: [id])
  type            PhotoType     @default(remise)
  filePath        String        @map("file_path")
  caption         String?
  mimeType        String        @map("mime_type")
  fileSize        Int           @map("file_size")
  createdAt       DateTime      @default(now()) @map("created_at")

  @@map("equipment_photos")
}

enum PhotoType {
  remise
  retour
  constat
}
```

**Migration** (20260331115207_add_equipment_photos.sql) :
```sql
CREATE TYPE "PhotoType" AS ENUM ('remise', 'retour', 'constat');

CREATE TABLE "equipment_photos" (
  "id" TEXT NOT NULL,
  "bon_equipment_id" TEXT NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "type" "PhotoType" NOT NULL DEFAULT 'remise',
  "file_path" TEXT NOT NULL,
  "caption" TEXT,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equipment_photos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "equipment_photos" ADD CONSTRAINT "equipment_photos_bon_equipment_id_fkey"
  FOREIGN KEY ("bon_equipment_id") REFERENCES "bon_equipments"("id") ON DELETE CASCADE;
ALTER TABLE "equipment_photos" ADD CONSTRAINT "equipment_photos_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
```

**Types de photos** :
- `remise` : Photo prise lors de la remise du matériel (état initial)
- `retour` : Photo prise lors du retour du matériel (état final)
- `constat` : Photo de constat intermédiaire (dégradation, incident)

---

### B2 — Service & Contrôleur d'upload

**Objectif** : Implémenter le upload sécurisé et chiffré des photos.

**Service** (`backend/src/equipment-photos/equipment-photos.service.ts`) :

| Méthode | Description |
|---------|-------------|
| `upload(bonId, equipmentId, file, type, caption, userId)` | Upload et chiffrement d'une photo |
| `findByEquipment(equipmentId)` | Liste les photos d'un équipement |
| `findByBon(bonId)` | Liste toutes les photos d'un bon |
| `getPhotoFile(photoId)` | Retourne le fichier déchiffré |
| `delete(photoId, userId)` | Suppression d'une photo (audit) |

**Validation** (lignes 13-14, 33-38) :
- Types MIME acceptés : `image/jpeg`, `image/png`, `image/webp`
- Taille max : 5 MB
- Vérification que l'équipement appartient au bon

**Chiffrement** (lignes 55) :
```typescript
const encrypted = this.encryption.encrypt(file.buffer.toString('base64'));
fs.writeFileSync(filePath, encrypted);
```

**Stockage** (lignes 49, 59) :
- Répertoire : `/data/photos/{bonId}/{equipmentId}/`
- Nom fichier : `{UUID}.enc` (fichier chiffré)
- Chemin relatif stocké en DB : `bonId/equipmentId/filename.enc`

**Contrôleur** (`backend/src/equipment-photos/equipment-photos.controller.ts`) :

| Endpoint | Méthode | Rôles | Description |
|----------|---------|-------|------------|
| `POST /bons/:bonId/equipments/:equipmentId/photos` | POST | technician, admin | Upload une photo |
| `GET /bons/:bonId/equipments/:equipmentId/photos` | GET | technician, admin | Liste les photos d'un équipement |
| `GET /bons/:bonId/photos` | GET | technician, admin | Liste les photos du bon |
| `DELETE /bons/:bonId/equipments/:equipmentId/photos/:photoId` | DELETE | technician, admin | Supprime une photo |
| `GET /photos/:photoId` | GET | authenticated | Télécharge la photo (déchiffrée) |

**Intercepteur d'upload** (ligne 30) :
```typescript
@UseInterceptors(FileInterceptor('file'))
async upload(@UploadedFile() file: Express.Multer.File, ...)
```

---

### B3 — UI Technicien — Photos à la remise

**Objectif** : Permettre au technicien de photographier les équipements lors de la mise à disposition.

**Composant** (`frontend/src/pages/bons/detail/EquipmentPhotos.tsx`) :

| Fonctionnalité | Implémentation |
|----------------|----------------|
| **Bouton photo** | Icône caméra, ouvre le file picker |
| **Upload** | Multipart POST à `/api/bons/:bonId/equipments/:equipmentId/photos` |
| **Galerie** | Grille de miniatures (16x16px) avec hover pour actions |
| **Suppression** | Confirmation + DELETE |
| **Prévisualisation** | Modal fullscreen au clic |

**Code exemple** (lignes 45-72) :
```typescript
const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setUploading(true);
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', defaultType);  // 'remise' par défaut

    await fetch(`/api/bons/${bonId}/equipments/${equipmentId}/photos`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then((r) => {
      if (!r.ok) throw new Error('Upload failed');
      return r.json();
    });

    onPhotosChange();  // Refresh galerie
  } finally {
    setUploading(false);
  }
};
```

**Intégration dans BonCreate** :
- Lors de l'ajout d'une ligne équipement, affiche le composant `EquipmentPhotos`
- Defaultype : `remise`
- Permet de prendre plusieurs photos par équipement

---

### B4 — UI Technicien — Photos au retour

**Objectif** : Documenter l'état du matériel au retour avec des photos.

**Implémentation** (`frontend/src/pages/bons/detail/` — Restitution modal) :
- Au moment de l'initiation de restitution, proposer d'ajouter des photos
- Type : `retour`
- Caption optionnelle : "Écran endommagé", "Clavier collant", etc.

**Flux** :
1. Technicien clique "Initier la restitution"
2. Modal de restitution s'ouvre
3. Pour chaque équipement restitué, affiche le composant `EquipmentPhotos` avec `defaultType="retour"`
4. Upload optionnel des photos
5. Confirmation finale + signature IT

---

### B5 — UI Collaborateur — Photos à la signature

**Objectif** : Optionnel — Permettre au collaborateur de photographier les équipements à la réception.

**Implémentation** (`frontend/src/pages/signature/SignaturePage.tsx`) :
- Après le bloc des conditions, afficher optionnellement : "Ajouter des photos de l'état actuel des équipements"
- Bouton "Photographier" pour chaque équipement (optionnel)
- Composant `EquipmentPhotos` avec `defaultType="remise"` et `canUpload=true`
- Nécessite l'authentification SSO

**Rationale** : Preuve visuelle que le collaborateur a reçu les équipements en bon état.

---

### B6 — Galerie photos dans le détail

**Objectif** : Afficher une galerie complète des photos dans la page de détail du bon.

**Composant** (`frontend/src/pages/bons/detail/EquipmentPhotos.tsx`) :
- Grille des photos avec métadonnées
- Tri par type (remise, retour, constat)
- Filtres par équipement
- Prévisualisation au clic
- Suppression (admin/technician)

**UI** :
```
Équipement 1 — Portable Lenovo
├─ [Photo 1] Remise (15 mars 2026 - Tech Support)
├─ [Photo 2] Remise (15 mars 2026 - Tech Support)
└─ [Photo 3] Retour (28 mars 2026 - Tech Support)

Équipement 2 — Écran Dell
├─ [Photo 1] Remise (15 mars 2026 - Collaborateur)
└─ [Photo 2] Retour + Caption: "Fissure coin inférieur" (28 mars 2026 - Tech Support)
```

---

### B7 — Photos dans le PDF (optionnel)

**Objectif** : Inclure des miniatures des photos dans le PDF signé pour preuve complète.

**Implémentation** (`backend/src/pdf/pdf.service.ts`) :
- Récupérer les photos du bon via `EquipmentPhotosService`
- Déchiffrer les fichiers image
- Insérer les miniatures (200x150px) dans le PDF
- Sous chaque équipement, afficher : "Photos : Remise (2) Retour (1)"

**Effort** : Élevé (édition d'image, gestion de la taille du PDF)

---

## Phase C — Améliorations complémentaires

### C1 — purchaseDate (Date d'achat)

**Objectif** : Tracer la date d'achat pour calculer l'amortissement et la valeur résiduelle.

**Base de données** (`schema.prisma` ligne 203) :
```prisma
model BonEquipment {
  // ... autres champs ...
  purchaseDate      DateTime? @map("purchase_date")
  // ...
}
```

**Migration** (20260331125002_add_purchase_date_and_insurance_policy.sql) :
```sql
ALTER TABLE "bon_equipments" ADD COLUMN "purchase_date" TIMESTAMP(3);
```

**DTO** (`backend/src/bons/dto/bon.dto.ts` ligne 23) :
```typescript
@IsOptional() @IsDateString() purchaseDate?: string;
```

**Frontend** (`frontend/src/pages/bons/BonCreate.tsx` ligne 49) :
```typescript
interface EquipmentLine {
  purchaseDate?: string;  // Format ISO 8601
}
```

**Utilisation** :
- Calcul de l'amortissement : `valeur_residuelle = estimatedValue * (1 - amortissement_annuel % * années_depuis_achat)`
- Affiché dans le détail du bon
- Optionnel dans le PDF

---

### C2 — insurancePolicyNo par filiale

**Objectif** : Configurer le numéro de police d'assurance par filiale.

**Base de données** (`schema.prisma` ligne 34) :
```prisma
model Filiale {
  // ... autres champs ...
  insurancePolicyNo String? @map("insurance_policy_no")
  // ...
}
```

**Migration** (20260331125002_add_purchase_date_and_insurance_policy.sql) :
```sql
ALTER TABLE "filiales" ADD COLUMN "insurance_policy_no" TEXT;
```

**Utilisation** :
- Endpoint CRUD filiales pour éditer le numéro
- Variable PDF : `INSURANCE_POLICY` dans la section assurance
- Affichage dans la page de détail du bon

**Exemple de configuration** :
- Filiale "Paris" → Numéro : `MULTI-2024-001234`
- Filiale "Lyon" → Numéro : `MULTI-2024-001235`

---

### C3 — Politique de signature électronique (documentation)

**Objectif** : Documenter le procédé technique et juridique de signature électronique.

**Fichier** : `docs/politique-signature-electronique.md`

**Contenu** :
1. Objet et cadre juridique (eIDAS, Code civil article 1367)
2. Procédé d'identification (SSO Microsoft Entra ID)
3. Manifestation du consentement (conditions + checkbox)
4. Intégrité du document (snapshots PDF immuables)
5. Tracabilité (IP, timestamp, user agent, audit logs)
6. Mécanisme de contestation
7. Conservation des données (durée + RGPD)
8. Responsabilités (IT, admin, collaborateur, DPO, juridique)
9. Limites et recommandations
10. Historique des versions

**Recommandations** (section 10.2) :
- Faire valider par un juriste
- Faire valider les conditions par la direction juridique
- Communiquer aux collaborateurs
- Soumettre un PDF type à l'assureur
- Revoir annuellement

---

### C4 — Service de rétention des données

**Objectif** : Implémenter la purge automatique des données expirées selon la politique de conservation.

**Service** (`backend/src/retention/retention.service.ts`) :

| Méthode | Description | Planification |
|---------|-------------|---------------|
| `runScheduledPurge()` | Exécute toutes les purges | Cron : dimanches 3h du matin |
| `purgeAll()` | Lance toutes les purges en parallèle | Appelable manuellement |
| `purgeExpiredTokens()` | Supprime les tokens de signature expirés | Configurable (défaut : 30 jours après expiration) |
| `purgeOldAuditLogs()` | Supprime les audit logs anciens | Configurable (défaut : 5 ans) |
| `getRetentionStats()` | Retourne les statistiques pour le dashboard | Dashboard admin |

**Configuration AppConfig** (lignes 13-16) :

| Clé | Valeur | Défaut |
|-----|--------|--------|
| `retention:enabled` | Activer/désactiver la purge | `false` |
| `retention:expired_tokens_days` | Jours après expiration avant purge de signature | `30` |
| `retention:audit_logs_years` | Années de conservation des audit logs | `5` |

**Cron job** (ligne 28) :
```typescript
@Cron('0 3 * * 0')  // Dimanche 3h du matin
async runScheduledPurge() {
  const enabled = await this.configService.get('retention', 'enabled');
  if (enabled !== 'true') return;

  const results = await this.purgeAll();
  this.logger.log(`Purge terminée : ${JSON.stringify(results)}`);
}
```

**Dashboard admin** :
- Affiche les statistiques de rétention
- Nombre de tokens expirés à purger
- Nombre d'audit logs à purger
- Bouton "Forcer la purge maintenant"

**Données purgées** :
- Tokens de signature non signés + expirés depuis N jours
- Audit logs antérieurs à N années

**Données CONSERVÉES** (durée relation de travail + 5 ans) :
- PDF snapshots (immuables, valeur contractuelle)
- Images de signature (chiffrées)
- Photos d'équipements (chiffrées)
- Audit logs (pour les 5 premières années)

---

## Migrations de base de données

Trois migrations SQL pour implémenter les phases A, B, C :

### Migration 1 : 20260331085823_add_legal_compliance_fields

Ajoute les champs pour la Phase A :
```sql
ALTER TABLE "bon_equipments" ADD COLUMN "estimated_value" DOUBLE PRECISION;
ALTER TABLE "bon_equipments" ADD COLUMN "return_condition" TEXT;
ALTER TABLE "signatures" ADD COLUMN "conditions_version" TEXT;
```

### Migration 2 : 20260331115207_add_equipment_photos

Ajoute la table EquipmentPhoto pour la Phase B :
```sql
CREATE TYPE "PhotoType" AS ENUM ('remise', 'retour', 'constat');
CREATE TABLE "equipment_photos" (
  "id" TEXT NOT NULL,
  "bon_equipment_id" TEXT NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "type" "PhotoType" NOT NULL DEFAULT 'remise',
  "file_path" TEXT NOT NULL,
  "caption" TEXT,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equipment_photos_pkey" PRIMARY KEY ("id")
);
-- Foreign keys...
```

### Migration 3 : 20260331125002_add_purchase_date_and_insurance_policy

Ajoute les champs pour la Phase C :
```sql
ALTER TABLE "bon_equipments" ADD COLUMN "purchase_date" TIMESTAMP(3);
ALTER TABLE "filiales" ADD COLUMN "insurance_policy_no" TEXT;
```

**Application des migrations** :
```bash
cd backend
npx prisma migrate deploy
```

---

## Points de vérification

### A1 — Conditions affichées

- [ ] Ouvrir un lien de signature → bloc conditions visible et scrollable
- [ ] Scroll jusqu'en bas → checkbox "Lu et approuvé" devient active
- [ ] Texte des conditions correspond à la config admin

### A2 — Admin configuration

- [ ] Page `/admin/configuration/conditions` accessible
- [ ] Éditer le texte des conditions → sauvegarde en AppConfig
- [ ] Bouton "Restaurer les défauts" fonctionne
- [ ] Version incrémentée automatiquement

### A3 — Conditions dans le PDF

- [ ] Générer un PDF de bon → section "CONDITIONS GÉNÉRALES" présente
- [ ] Texte conforme à la config
- [ ] Variables substituées (FILIALE, DATE, etc.)

### A4 — Versioning

- [ ] Signer un document → `conditions_version` stocké dans `Signature`
- [ ] Vérifier en base : `SELECT * FROM signatures WHERE id = '...'`
- [ ] Colonne `conditions_version` contient la version

### A5 — Mentions distinctes

- [ ] PDF mise_disposition : mention IT ≠ mention restitution
- [ ] PDF restitution : mention adaptée au type
- [ ] PDF cloture : mention distincte

### A6 — estimatedValue

- [ ] Créer un bon avec `estimatedValue` sur les équipements
- [ ] Valeur affichée dans le détail
- [ ] Optionnel dans le PDF (vérifier config)
- [ ] Somme totale calculée correctement

### A7 — returnCondition

- [ ] Initier restitution → champ "État" visible pour chaque équipement
- [ ] Saisir "Bon état" ou "Écran cassé"
- [ ] Valider → `return_condition` stocké dans `BonEquipment`
- [ ] Affiché dans le PDF de restitution

### A8 — Section assurance

- [ ] Config `/admin/config/insurance` présente
- [ ] Éditer le texte de l'assurance
- [ ] Générer un PDF → section "COUVERTURE ASSURANCE" présente
- [ ] Variable `INSURANCE_POLICY` substituée

### B1-B2 — Upload photos

- [ ] Créer un bon, accéder au détail
- [ ] Cliquer "Ajouter une photo" → file picker
- [ ] Uploader une image JPEG/PNG
- [ ] Vérifier en base : `equipment_photos` table contient l'entrée
- [ ] Fichier chiffré dans `/data/photos/{bonId}/{equipmentId}/`

### B3 — Photos remise

- [ ] Lors de la création d'un bon, afficher composant `EquipmentPhotos`
- [ ] Photographier les équipements au moment de la création
- [ ] Photos liées au bon (type = `remise`)

### B4 — Photos retour

- [ ] Initier restitution → proposer des photos
- [ ] Uploader avec type `retour`
- [ ] Vérifier type en base

### B5 — Photos signature (optionnel)

- [ ] Si implémenté, ouvrir lien signature → bouton photo visible
- [ ] Uploader une photo de l'équipement à la signature
- [ ] Type = `remise`

### B6 — Galerie photos

- [ ] Ouvrir détail du bon → section "Galerie photos"
- [ ] Afficher les photos par équipement
- [ ] Cliquer pour prévisualiser (modal)
- [ ] Supprimer (if technician/admin)

### B7 — Photos dans le PDF (optionnel)

- [ ] Générer un PDF → miniatures des photos présentes
- [ ] Légendes correctes (date, auteur, type)

### C1 — purchaseDate

- [ ] Créer un bon → saisir date d'achat optionnelle
- [ ] Vérifier en base : `purchase_date` stockée
- [ ] Affichée dans le détail

### C2 — insurancePolicyNo

- [ ] `/admin/filiales` → éditer numéro de police
- [ ] Variable `INSURANCE_POLICY` substituée dans le PDF
- [ ] Affichée dans la section assurance

### C3 — Documentation

- [ ] Fichier `docs/politique-signature-electronique.md` existe
- [ ] Contient sections : objet, cadre juridique, identification, consentement, intégrité, tracabilité, conservation
- [ ] Communiquer aux collaborateurs

### C4 — Rétention

- [ ] `/admin/retention` → affiche statistiques
- [ ] Configuration `retention:enabled = true` en AppConfig
- [ ] Cron job exécuté dimanche 3h
- [ ] Tokens non signés + expirés depuis 30j sont purgés
- [ ] Audit logs > 5 ans sont purgés

---

## Prochaines étapes

### Validations à faire

1. **Juridique** : Faire valider par un juriste spécialisé en droit numérique
   - Niveau juridique de la signature simple
   - Conformité des conditions générales
   - RGPD de la collecte de données (IP, email, user agent)

2. **DPO** : Consultation du Data Protection Officer
   - Durée de conservation des données
   - Chiffrement des signatures et photos
   - Mécanisme de suppression

3. **Assurance** : Soumettre un PDF type à l'assureur
   - Valider la couverture du matériel
   - Vérifier les conditions d'exclusion
   - Confirmer la traçabilité

4. **Direction** : Approbation des conditions générales
   - Adapter le texte aux risques spécifiques de Groupe Livio
   - Communiquer aux collaborateurs via le règlement intérieur

### Points d'amélioration futurs

1. **Signature avancée (eIDAS niveau 2)** : Pour les bons de haute valeur
   - Certificat numérique (prestataire qualifié)
   - Horodatage qualifié

2. **Photos dans le PDF** (Phase B7) : Intégration complète
   - Miniatures incluses dans le snapshot PDF
   - Améliore la preuve visuelle

3. **Dashboard analytics** :
   - Nombre de bons signés par filiale
   - Taux de restitution par période
   - Valeur totale du matériel en circulation
   - Contestations par mois

4. **Intégration assurance** :
   - Export automatique des sinistres potentiels
   - Interface avec le gestionnaire d'assurance

---

## Fichiers clés (chemins absolus)

### Base de données
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\prisma\schema.prisma`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\prisma\migrations\20260331085823_add_legal_compliance_fields\migration.sql`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\prisma\migrations\20260331115207_add_equipment_photos\migration.sql`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\prisma\migrations\20260331125002_add_purchase_date_and_insurance_policy\migration.sql`

### Phase A
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\frontend\src\pages\signature\SignaturePage.tsx`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\frontend\src\pages\admin\configuration\ConfigConditionsPage.tsx`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\pdf\pdf-template-config.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\pdf\pdf.service.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\signature\signature.service.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\admin\admin.controller.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\frontend\src\pages\bons\BonCreate.tsx`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\frontend\src\pages\bons\detail\RestitutionModal.tsx`

### Phase B
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\equipment-photos\equipment-photos.service.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\equipment-photos\equipment-photos.controller.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\frontend\src\pages\bons\detail\EquipmentPhotos.tsx`

### Phase C
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\retention\retention.service.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\backend\src\bons\dto\bon.dto.ts`
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\docs\politique-signature-electronique.md`

### Documentation
- `C:\Users\clemieux\Claude\BonDeMiseADisposition\docs\phase-legal-compliance.md` (ce fichier)

---

**Mise à jour finale** : 31 mars 2026
**Prochaine révision** : après validation juridique et assurance
**État** : Prêt pour validation externe
