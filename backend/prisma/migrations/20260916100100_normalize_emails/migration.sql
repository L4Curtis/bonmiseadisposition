-- Normalisation des emails utilisateurs (minuscules + trim) et contrainte
-- d'unicite insensible a la casse. Coordonne avec le lot auth qui normalise
-- desormais a l'ecriture : ce backfill couvre les comptes deja en base.

-- 1) Garde-fou : si des doublons insensibles a la casse existent deja (ex.
--    "Jean.Dupont@x" et "jean.dupont@x" comme deux comptes distincts), la
--    normalisation ci-dessous les ferait entrer en collision sur la future
--    contrainte unique. On leve une exception explicite pour que
--    `prisma migrate deploy` echoue proprement au lieu de corrompre les
--    donnees (une des deux lignes serait sinon rejetee silencieusement par
--    l'UPDATE en cas d'unicite déjà stricte, ou la CREATE UNIQUE INDEX
--    echouerait avec un message Postgres peu exploitable).
DO $$
DECLARE
  duplicate_list TEXT;
BEGIN
  SELECT string_agg(email_lower || ' (' || occurrences || ')', ', ')
  INTO duplicate_list
  FROM (
    SELECT lower(trim(email)) AS email_lower, count(*) AS occurrences
    FROM "users"
    GROUP BY lower(trim(email))
    HAVING count(*) > 1
  ) AS dupes;

  IF duplicate_list IS NOT NULL THEN
    RAISE EXCEPTION 'Doublons d''email insensibles a la casse detectes dans users, resolvez-les manuellement avant de redeployer : %', duplicate_list;
  END IF;
END $$;

-- 2) Backfill : emails existants mis en forme canonique (minuscules, trim)
UPDATE "users"
SET "email" = lower(trim("email"))
WHERE "email" <> lower(trim("email"));

-- 3) Contrainte d'unicite insensible a la casse, en complement de la
--    contrainte @unique existante (sensible a la casse) sur "email"
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users" (lower("email"));
