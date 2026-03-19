-- Suppression des valeurs fantômes signed_mise_dispo et signed_restitution du BonStatus
-- Ces statuts n'ont jamais été utilisés en production (aucune ligne en base avec ces valeurs)
-- Le workflow va directement de sent_mise_dispo → active et sent_restitution → archived

-- Étape 1 : sauvegarder l'ancien enum
ALTER TYPE "BonStatus" RENAME TO "BonStatus_old";

-- Étape 2 : créer le nouvel enum propre (7 valeurs réelles)
CREATE TYPE "BonStatus" AS ENUM ('draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'archived', 'cancelled', 'contested');

-- Étape 3 : supprimer le DEFAULT avant de changer le type (PostgreSQL ne peut pas caster automatiquement)
ALTER TABLE "bons" ALTER COLUMN "status" DROP DEFAULT;

-- Étape 4 : migrer la colonne (USING cast — safe car aucune ligne ne contient les valeurs supprimées)
ALTER TABLE "bons"
  ALTER COLUMN "status" TYPE "BonStatus"
  USING "status"::text::"BonStatus";

-- Étape 5 : remettre le DEFAULT avec le nouveau type
ALTER TABLE "bons" ALTER COLUMN "status" SET DEFAULT 'draft'::"BonStatus";

-- Étape 6 : supprimer l'ancien enum
DROP TYPE "BonStatus_old";
