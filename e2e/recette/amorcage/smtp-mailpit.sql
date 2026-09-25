-- ─────────────────────────────────────────────────────────────────────────────
-- Banc de recette : tous les emails de l'application partent vers Mailpit
-- (conteneur « mailpit », SMTP sans authentification sur le port 1025).
--
-- Exécuté par amorcer.cjs sur la base vierge du banc (migrations déjà
-- appliquées par le backend au démarrage). Rejouable : les réglages sont
-- réécrits à l'identique.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO app_config (id, category, key, value, encrypted, description, updated_at)
VALUES
  (gen_random_uuid()::text, 'smtp', 'host', 'mailpit', false, 'Banc de recette : Mailpit', now()),
  (gen_random_uuid()::text, 'smtp', 'port', '1025', false, 'Banc de recette : Mailpit', now()),
  (gen_random_uuid()::text, 'smtp', 'secure', 'false', false, 'Banc de recette : Mailpit', now()),
  (gen_random_uuid()::text, 'smtp', 'from', 'service-informatique@recette.test', false, 'Banc de recette : Mailpit', now())
ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
