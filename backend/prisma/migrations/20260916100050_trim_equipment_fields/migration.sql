-- Normalisation des champs texte existants de bon_equipments (espaces
-- superflus en tete/fin, valeurs devenues vides apres trim -> NULL). La
-- normalisation a l'ecriture pour les nouvelles valeurs est geree par
-- BonsService (autre lot) ; cette migration ne couvre que les donnees deja
-- en base.
--
-- NB: "IS DISTINCT FROM" est utilise plutot que "<>" pour couvrir
-- correctement le cas d'une valeur composee uniquement d'espaces : trim()
-- la transforme en '' puis NULLIF en NULL, et "colonne <> NULL" vaut
-- toujours NULL (donc jamais vrai) en SQL standard, ce qui laisserait ces
-- lignes non normalisees.

UPDATE "bon_equipments"
SET "serial_number" = NULLIF(trim("serial_number"), '')
WHERE "serial_number" IS NOT NULL
  AND "serial_number" IS DISTINCT FROM NULLIF(trim("serial_number"), '');

UPDATE "bon_equipments"
SET "inventory_number" = NULLIF(trim("inventory_number"), '')
WHERE "inventory_number" IS NOT NULL
  AND "inventory_number" IS DISTINCT FROM NULLIF(trim("inventory_number"), '');

UPDATE "bon_equipments"
SET "custom_label" = NULLIF(trim("custom_label"), '')
WHERE "custom_label" IS NOT NULL
  AND "custom_label" IS DISTINCT FROM NULLIF(trim("custom_label"), '');
