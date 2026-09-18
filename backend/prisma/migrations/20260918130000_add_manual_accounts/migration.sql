-- Comptes manuels (compagnons de chantier sans compte Active Directory) :
-- email devient optionnel + marqueur isManualAccount.
--
-- SQL isolé à la main à partir de `prisma migrate diff` (comparaison schéma
-- <-> base de dev) : le diff brut incluait aussi des DROP TABLE/DROP COLUMN
-- issus des anciennes migrations 20260331* absentes du dépôt (equipment_photos,
-- bon_equipments.estimated_value/purchase_date/return_condition,
-- filiales.insurance_policy_no, signatures.conditions_version) — hors
-- périmètre de ce lot, volontairement ignorés ici.

-- 1) email optionnel : les comptes créés manuellement (POST /users/manual)
--    n'ont pas nécessairement d'adresse professionnelle. Les deux index
--    uniques existants sur cette colonne (users_email_key et la variante
--    fonctionnelle insensible à la casse users_email_lower_idx, posée par la
--    migration 20260916100100_normalize_emails) continuent de fonctionner
--    sans modification : PostgreSQL autorise plusieurs NULL dans un index
--    unique, seule une VALEUR dupliquée (insensible à la casse) est rejetée.
--    Vérifié manuellement sur la base de dev (INSERT de plusieurs NULL dans
--    un index unique fonctionnel de test).
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- 2) Marqueur de compte manuel : jamais synchronisé/désactivé par LDAP,
--    jamais authentifiable (ni SSO, ni login local).
ALTER TABLE "users" ADD COLUMN "is_manual_account" BOOLEAN NOT NULL DEFAULT false;
