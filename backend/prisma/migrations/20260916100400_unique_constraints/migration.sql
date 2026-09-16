-- Contraintes d'unicite additionnelles, posees prudemment : verification
-- prealable de l'absence de doublons puis creation de l'index unique, pour
-- que `prisma migrate deploy` echoue proprement (avec la liste des doublons)
-- plutot que de faire echouer la CREATE UNIQUE INDEX avec un message
-- Postgres peu exploitable, ou pire, de bloquer silencieusement une future
-- insertion legitime.

-- EquipmentCatalog (category, brand, model) : deux lignes identiques sur ce
-- triplet sont presque toujours une erreur de saisie plutot qu'un besoin
-- metier reel (un meme modele materiel n'a normalement qu'une seule
-- categorie possible : un "ThinkBook 16 G6" ne sera jamais catalogue a la
-- fois en pc_portable et en ecran). Si un cas legitime apparaissait malgre
-- tout (ex. un accessoire reference dans deux univers), il resterait
-- distinguable par une variation du champ "model" (ex. suffixe), donc la
-- contrainte est jugee sans risque.
DO $$
DECLARE
  duplicate_list TEXT;
BEGIN
  SELECT string_agg(category::text || '/' || brand || '/' || model || ' (' || occurrences || ')', ', ')
  INTO duplicate_list
  FROM (
    SELECT category, brand, model, count(*) AS occurrences
    FROM "equipment_catalog"
    GROUP BY category, brand, model
    HAVING count(*) > 1
  ) AS dupes;

  IF duplicate_list IS NOT NULL THEN
    RAISE EXCEPTION 'Doublons (categorie/marque/modele) detectes dans equipment_catalog, fusionnez-les avant de redeployer : %', duplicate_list;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "equipment_catalog_category_brand_model_key" ON "equipment_catalog" ("category", "brand", "model");

-- Filiale.name : deux filiales ne devraient jamais partager le meme nom
-- technique (le champ displayName porte deja la variante lisible/commerciale).
-- Index FONCTIONNEL insensible a la casse (et non une contrainte @unique
-- classique sur "name") : le matching LDAP compare les noms de filiale en
-- insensible a la casse, donc la contrainte doit l'etre aussi, sinon
-- "Nord"/"nord" collisionneraient cote LDAP sans etre bloques en base.
DO $$
DECLARE
  duplicate_list TEXT;
BEGIN
  SELECT string_agg(name_lower || ' (' || occurrences || ')', ', ')
  INTO duplicate_list
  FROM (
    SELECT lower(name) AS name_lower, count(*) AS occurrences
    FROM "filiales"
    GROUP BY lower(name)
    HAVING count(*) > 1
  ) AS dupes;

  IF duplicate_list IS NOT NULL THEN
    RAISE EXCEPTION 'Doublons de nom de filiale (insensibles a la casse) detectes, fusionnez-les avant de redeployer : %', duplicate_list;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "filiales_name_lower_idx" ON "filiales" (lower("name"));
