-- Normalisation du catalogue (marque/modèle/description, nom de pack) +
-- unicité insensible à la casse + FK catalog_item_id non destructive.
--
-- Constat d'audit : sur une instance réelle, des articles portent une espace
-- finale ("Salamèche ", "Pokéball ") et la contrainte d'unicité
-- (category, brand, model) est sensible à la casse ("Dell" et "dell"
-- coexistent), ce qui scinde le comptage des modèles dans les indicateurs.

-- 1) Trim des valeurs existantes. brand/model/name sont NOT NULL : on se
--    contente de trim() (jamais de NULLIF -> NULL, ça casserait la colonne).
--    description est nullable : une valeur qui devient vide après trim est
--    ramenée à NULL plutôt que ''.
UPDATE "equipment_catalog"
SET "brand" = trim("brand")
WHERE "brand" IS DISTINCT FROM trim("brand");

UPDATE "equipment_catalog"
SET "model" = trim("model")
WHERE "model" IS DISTINCT FROM trim("model");

UPDATE "equipment_catalog"
SET "description" = NULLIF(trim("description"), '')
WHERE "description" IS NOT NULL
  AND "description" IS DISTINCT FROM NULLIF(trim("description"), '');

UPDATE "equipment_packs"
SET "name" = trim("name")
WHERE "name" IS DISTINCT FROM trim("name");

UPDATE "equipment_packs"
SET "description" = NULLIF(trim("description"), '')
WHERE "description" IS NOT NULL
  AND "description" IS DISTINCT FROM NULLIF(trim("description"), '');

-- 2) Désactivation des doublons révélés par la normalisation et par la
--    future comparaison insensible à la casse : pour chaque groupe
--    (category, lower(brand), lower(model)) comportant plusieurs lignes
--    ACTIVES, on ne garde active que la plus ancienne (created_at le plus
--    petit, id en repli déterministe) et on désactive les autres.
--    Volontairement une DÉSACTIVATION et non une fusion/suppression : aucune
--    ligne n'est supprimée ni ré-associée, donc aucun bon_equipments /
--    equipment_pack_items existant n'a besoin d'être repointé — la
--    traçabilité des bons déjà émis référençant un doublon reste intacte.
--    Seul un nouvel usage (création/modification de bon ou de pack) devra
--    désormais passer par l'article conservé actif.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "category", lower("brand"), lower("model")
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "equipment_catalog"
  WHERE "active" = true
)
UPDATE "equipment_catalog" AS ec
SET "active" = false
FROM ranked
WHERE ec."id" = ranked."id"
  AND ranked.rn > 1;

-- 3) Remplacement de l'unique (category, brand, model) — sensible à la casse
--    — par un index unique fonctionnel insensible à la casse. Partiel
--    (WHERE active) : un doublon désactivé par l'étape 2 ci-dessus (ou plus
--    tard, à la main) peut coexister avec l'article actif équivalent, mais
--    deux articles ACTIFS identiques (catégorie + marque + modèle en
--    ignorant la casse) sont désormais impossibles. Cf. le commentaire dans
--    schema.prisma : cette contrainte n'est représentable qu'en migration
--    (Prisma ne sait pas exprimer lower(...) ni WHERE dans @@unique/@@index).
DROP INDEX "equipment_catalog_category_brand_model_key";

CREATE UNIQUE INDEX "equipment_catalog_category_brand_model_ci_active_key"
  ON "equipment_catalog" ("category", lower("brand"), lower("model"))
  WHERE "active" = true;

-- 4) bon_equipments.catalog_item_id : ON DELETE SET NULL -> ON DELETE
--    RESTRICT (equipment_pack_items.catalog_item_id était déjà en RESTRICT).
--    Un article de catalogue référencé sur un bon — signé ou non — ne doit
--    jamais pouvoir être supprimé physiquement en silence, ce qui romprait
--    la traçabilité d'un bon déjà signé sans avertissement. Seule la
--    désactivation logique (active = false) reste un chemin de retrait.
ALTER TABLE "bon_equipments" DROP CONSTRAINT "bon_equipments_catalog_item_id_fkey";
ALTER TABLE "bon_equipments" ADD CONSTRAINT "bon_equipments_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "equipment_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
