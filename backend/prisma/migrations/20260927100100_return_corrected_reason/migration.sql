-- Motif d'invalidation d'un lien : le marquage d'une restitution a été annulé
-- ou corrigé par l'équipe informatique (jusqu'ici enregistré « modified », que
-- le collaborateur lisait « Bon modifié »). Seule instruction de la migration :
-- `ALTER TYPE … ADD VALUE` ne s'emploie pas avec d'autres changements.
ALTER TYPE "SignatureInvalidationReason" ADD VALUE IF NOT EXISTS 'return_corrected';
