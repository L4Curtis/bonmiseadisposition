-- Historique d'un bon : les phrases du journal disent la vérité sur les
-- entrées écrites avant cette version (aucune colonne ajoutée, données
-- seulement ; idempotente : chaque mise à jour ne vise que les lignes qui
-- n'ont pas encore la clé qu'elle ajoute).

-- 1. Remise : voie de la remise. Au guichet, aucun email n'est parti.
UPDATE audit_logs
SET details = details || jsonb_build_object(
  'channel',
  CASE WHEN (details ->> 'inPerson') = 'true' THEN 'lien de signature au guichet' ELSE 'lien envoyé par email' END
)
WHERE action = 'bon_sent'
  AND jsonb_typeof(details) = 'object'
  AND details ? 'inPerson'
  AND NOT details ? 'channel';

-- 2. Lien envoyé depuis la fiche : nom du document en toutes lettres.
UPDATE audit_logs
SET details = details || jsonb_build_object(
  'documentName',
  CASE details ->> 'document'
    WHEN 'mise_disposition' THEN 'la mise à disposition'
    WHEN 'restitution' THEN 'la restitution'
    ELSE 'le PV de non-restitution'
  END
)
WHERE action = 'reminder_sent'
  AND jsonb_typeof(details) = 'object'
  AND (details ->> 'document') IN ('mise_disposition', 'restitution', 'pv_cloture')
  AND NOT details ? 'documentName';

-- 3. Signature au guichet sur le compte d'un technicien : l'auteur est le
--    collaborateur titulaire (retrouvé par `titulaireEmail`, à défaut le
--    titulaire du bon), « en présence de » ce compte (gardé dans
--    `signerEmail`). Avant cette version, l'entrée portait le compte connecté.
UPDATE audit_logs a
SET user_id = COALESCE(
      (SELECT t.id FROM users t WHERE lower(t.email) = lower(a.details ->> 'titulaireEmail') ORDER BY t.created_at LIMIT 1),
      b.collaborateur_id
    ),
    user_email = COALESCE(a.details ->> 'titulaireEmail', c.email),
    details = a.details || jsonb_build_object(
      'signerEmail', a.user_email,
      'signerAccountId', a.user_id,
      'inPersonContext', 'au guichet, en présence de ' || COALESCE(
        (SELECT NULLIF(w.display_name, '') FROM users w WHERE lower(w.email) = lower(a.user_email) ORDER BY w.created_at LIMIT 1),
        a.user_email
      )
    )
FROM bons b
JOIN users c ON c.id = b.collaborateur_id
WHERE a.bon_id = b.id
  AND a.action IN ('signed_mise_disposition', 'signed_restitution', 'signed_pv_cloture')
  AND jsonb_typeof(a.details) = 'object'
  AND (a.details ->> 'isInPerson') = 'true'
  AND COALESCE(a.details ->> 'signedByProxy', 'false') <> 'true'
  AND NOT a.details ? 'inPersonContext'
  AND a.user_email IS NOT NULL
  AND lower(a.user_email) IS DISTINCT FROM lower(COALESCE(a.details ->> 'titulaireEmail', c.email))
  -- Le titulaire sur son propre compte, même si son adresse a changé depuis.
  AND NOT EXISTS (SELECT 1 FROM users o WHERE lower(o.email) = lower(a.user_email) AND o.id = b.collaborateur_id);

-- 4. Les autres signatures au guichet : sur le compte du titulaire, ou par un
--    mandataire pour son compte.
UPDATE audit_logs a
SET details = a.details || jsonb_build_object(
  'inPersonContext',
  CASE WHEN (a.details ->> 'signedByProxy') = 'true'
    THEN 'au guichet, pour le compte de ' || c.display_name || ' (mandataire)'
    ELSE 'au guichet'
  END
)
FROM bons b
JOIN users c ON c.id = b.collaborateur_id
WHERE a.bon_id = b.id
  AND a.action IN ('signed_mise_disposition', 'signed_restitution', 'signed_pv_cloture')
  AND jsonb_typeof(a.details) = 'object'
  AND (a.details ->> 'isInPerson') = 'true'
  AND NOT a.details ? 'inPersonContext';
