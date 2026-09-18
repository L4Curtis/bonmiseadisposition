-- Un bon peut désormais être établi au nom d'un collaborateur sans adresse
-- email (compagnon de chantier créé manuellement, cf. migration
-- 20260918130000_add_manual_accounts). Ce bon se signe uniquement en
-- présentiel : l'envoi/relance par email reste refusé côté application
-- (isDeliverableEmail retourne false pour une valeur NULL).
ALTER TABLE "bons" ALTER COLUMN "collaborateur_email" DROP NOT NULL;
