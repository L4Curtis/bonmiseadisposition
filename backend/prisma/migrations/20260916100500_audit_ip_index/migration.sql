-- Index manquant pour le verrou de brute-force par IP (LOT C bug #2) :
-- AuthService.checkBruteForce() compte désormais les login_local_failed par
-- ip_address seul (toutes cibles confondues) sur une fenêtre de 30 minutes.
-- Sans cet index, cette requête dégénère en scan séquentiel de toute la table
-- audit_logs à mesure qu'elle grossit. IF NOT EXISTS pour rester rejouable.
CREATE INDEX IF NOT EXISTS "audit_logs_ip_address_action_created_at_idx" ON "audit_logs" ("ip_address", "action", "created_at");
