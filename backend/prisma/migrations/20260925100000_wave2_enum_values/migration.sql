-- Vague 2 de la refonte, socle (1/2) : nouvelles valeurs d'énumérations
-- existantes.
--
-- Ce fichier ne contient QUE des `ALTER TYPE ... ADD VALUE`. PostgreSQL
-- interdit d'utiliser une valeur ajoutée ainsi dans la transaction qui l'a
-- créée (« unsafe use of new value of enum type ») ; `prisma migrate deploy`
-- exécute chaque fichier dans sa propre transaction. Aucune instruction qui
-- lit ou écrit ces valeurs ne doit donc rejoindre ce fichier : elles vont dans
-- une migration ultérieure. `IF NOT EXISTS` rend le fichier rejouable.

-- Documents des deux gestes « sans signature » (R-031).
ALTER TYPE "PdfSnapshotType" ADD VALUE IF NOT EXISTS 'remise_sans_signature';
ALTER TYPE "PdfSnapshotType" ADD VALUE IF NOT EXISTS 'cloture_sans_signature';

-- Email « remise constatée sans signature » (R-014), relance de l'IT pour une
-- contestation non traitée sous 7 jours, alerte « nouveau lien demandé »
-- (R-058).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'handover_without_signature';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'contestation_overdue_alert';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'link_request_alert';

-- Email volontairement non envoyé (collaborateur sans adresse : présentiel
-- uniquement, R-034), distinct d'un échec.
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'skipped';
