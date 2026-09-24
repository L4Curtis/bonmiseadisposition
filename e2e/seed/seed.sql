-- ─────────────────────────────────────────────────────────────────────────────
-- Amorçage de l'environnement E2E — exécuté une fois, après le démarrage de la
-- compose (voir e2e/seed/seed.sh), sur une base vide (migrations déjà
-- appliquées par le conteneur backend au démarrage).
--
-- Fournit : une filiale active, un collaborateur avec une adresse email
-- valide, un collaborateur sans adresse (compte manuel, façon « compagnon de
-- chantier »), un collaborateur à compte local capable de se connecter (portail
-- « Mes bons »), un article de catalogue actif, et la configuration SMTP
-- pointée vers mailpit. Le compte admin@local est provisionné automatiquement
-- par le backend au démarrage (voir backend/src/auth/admin-provisioning.ts) —
-- rien à faire ici pour lui.
--
-- Rejouable tant qu'aucun test n'a tourné : supprime d'abord ses propres
-- données (marquées « [E2E] » ou en @e2e.local), jamais autre chose. Une fois
-- des bons créés, ils référencent la filiale et les collaborateurs amorcés :
-- la purge échoue (clé étrangère, transaction annulée, rien n'est modifié) et
-- il faut repartir d'une base neuve (`down -v`). Les UUID sont des colonnes texte ; id et
-- updated_at ne sont pas générés automatiquement par Postgres sur un INSERT
-- brut (contrairement à Prisma) et doivent donc être fournis explicitement.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DELETE FROM app_config WHERE category = 'smtp';
DELETE FROM users WHERE email LIKE '%@e2e.local' OR sam_account_name LIKE 'e2e.%';
DELETE FROM equipment_catalog WHERE description LIKE '[E2E]%';
DELETE FROM filiales WHERE name = 'E2E';

-- ── Filiale ───────────────────────────────────────────────────────────────
INSERT INTO filiales (id, name, display_name, address, siret, active, created_at, updated_at)
VALUES (gen_random_uuid()::text, 'E2E', 'E2E Test', '1 rue des Tests, 69000 Lyon', '00000000000000', true, now(), now());

-- ── Collaborateur avec adresse email valide ─────────────────────────────────
INSERT INTO users (
  id, sam_account_name, display_name, email, department, filiale_id, role,
  is_it_staff, active, is_local_account, is_manual_account, must_change_password,
  created_at, updated_at
)
SELECT gen_random_uuid()::text, 'e2e.seed.avec-email', 'E2E Seed AvecEmail', 'seed.avec-email@e2e.local',
       'Amorçage E2E', f.id, 'collaborator', false, true, false, false, false, now(), now()
FROM filiales f WHERE f.name = 'E2E';

-- ── Collaborateur sans adresse (compte manuel, façon compagnon de chantier) ─
INSERT INTO users (
  id, sam_account_name, display_name, email, department, filiale_id, role,
  is_it_staff, active, is_local_account, is_manual_account, must_change_password,
  created_at, updated_at
)
SELECT gen_random_uuid()::text, 'e2e.seed.sans-email', 'E2E Seed SansEmail', NULL,
       'Amorçage E2E', f.id, 'collaborator', false, true, false, true, false, now(), now()
FROM filiales f WHERE f.name = 'E2E';

-- ── Collaborateur authentifiable (portail « Mes bons », contestation) ────────
-- Il n'y a ni annuaire ni Entra dans cet environnement : le seul moyen pour un
-- collaborateur de se connecter est un compte LOCAL (is_local_account +
-- password_hash). Rôle collaborator, aucun droit IT : il ne voit que ses bons.
-- Mot de passe en clair : E2ePortail#2026 (voir e2e/tests/helpers/env.ts) —
-- valeur FACTICE, propre à cet environnement jetable. Empreinte bcrypt
-- (coût 10) calculée avec bcryptjs, la bibliothèque du backend :
--   node -e "console.log(require('bcryptjs').hashSync('E2ePortail#2026', 10))"
-- must_change_password=false et password_changed_at=now() : pas d'écran de
-- changement imposé à la connexion (le parcours de l'admin le couvre déjà).
INSERT INTO users (
  id, sam_account_name, display_name, email, department, filiale_id, role,
  is_it_staff, active, is_local_account, is_manual_account, must_change_password,
  password_hash, password_changed_at, created_at, updated_at
)
SELECT gen_random_uuid()::text, 'e2e.seed.portail', 'E2E Seed Portail', 'seed.portail@e2e.local',
       'Amorçage E2E', f.id, 'collaborator', false, true, true, false, false,
       '$2a$10$fNbNg7KOkHy6.eg50eAR3uvlsVx/8LitbFyxn0RQUsg/Q4r1APOJq', now(), now(), now()
FROM filiales f WHERE f.name = 'E2E';

-- ── Article de catalogue ─────────────────────────────────────────────────────
INSERT INTO equipment_catalog (id, category, brand, model, description, active, created_at, updated_at)
VALUES (gen_random_uuid()::text, 'pc_portable'::"EquipmentCategory", 'E2E', 'Materiel Test', '[E2E] article de test end-to-end', true, now(), now());

-- ── SMTP pointé vers mailpit (pas d'authentification, le conteneur mailpit
--    accepte tout expéditeur/destinataire) ───────────────────────────────────
INSERT INTO app_config (id, category, key, value, encrypted, description, updated_at)
VALUES
  (gen_random_uuid()::text, 'smtp', 'host', 'mailpit', false, '[E2E]', now()),
  (gen_random_uuid()::text, 'smtp', 'port', '1025', false, '[E2E]', now()),
  (gen_random_uuid()::text, 'smtp', 'secure', 'false', false, '[E2E]', now()),
  (gen_random_uuid()::text, 'smtp', 'from', 'e2e@bons.local', false, '[E2E]', now());

COMMIT;

-- ── Contrôle ────────────────────────────────────────────────────────────────
SELECT 'filiales' AS objet, count(*) FROM filiales WHERE name = 'E2E'
UNION ALL SELECT 'collaborateurs', count(*) FROM users WHERE email LIKE '%@e2e.local' OR sam_account_name LIKE 'e2e.%'
UNION ALL SELECT 'catalogue', count(*) FROM equipment_catalog WHERE description LIKE '[E2E]%'
UNION ALL SELECT 'smtp_config', count(*) FROM app_config WHERE category = 'smtp';
