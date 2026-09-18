-- ─────────────────────────────────────────────────────────────────────────────
-- Jeu de données de DÉMONSTRATION — bons de mise à disposition
--
-- Crée des filiales, des collaborateurs, un catalogue, des packs et environ
-- 140 bons répartis sur les 12 derniers mois, avec leurs équipements,
-- signatures, emails, contestations et journal d'audit : de quoi remplir le
-- tableau de bord, l'inventaire et les indicateurs.
--
-- Usage (dans le conteneur de la base, shell /bin/sh) :
--   psql -U app -d bons_disposition -f demo-data.sql
-- (DATABASE_URL n'existe QUE dans le conteneur backend : dans le conteneur de
--  la base, psql sans -U tente de se connecter avec l'utilisateur du shell
--  — « FATAL: role "root" does not exist ».)
-- ou, sans copier le fichier :
--   docker exec -i <conteneur-db> psql "$DATABASE_URL" < demo-data.sql
--
-- ⚠️ À réserver aux instances de test. Tout ce qui est créé ici porte la marque
-- « [DEMO] » ou un email en @demo.local : la suppression se fait avec le bloc
-- fourni tout en bas du fichier.
--
-- Rejouable : le script supprime d'abord ses propres données, jamais les vôtres.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Purge des données de démonstration précédentes ───────────────────────────
DELETE FROM audit_logs WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
DELETE FROM notification_logs WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
DELETE FROM contestations WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
DELETE FROM signatures WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
DELETE FROM bon_equipments WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
DELETE FROM bons WHERE notes LIKE '[DEMO]%';
DELETE FROM equipment_pack_items WHERE pack_id IN (SELECT id FROM equipment_packs WHERE description LIKE '[DEMO]%');
DELETE FROM equipment_packs WHERE description LIKE '[DEMO]%';
DELETE FROM equipment_catalog WHERE description LIKE '[DEMO]%';
DELETE FROM users WHERE email LIKE '%@demo.local' OR sam_account_name LIKE 'demo.%';
DELETE FROM filiales WHERE name LIKE 'DEMO-%';

DO $$
DECLARE
  v_filiales    text[];
  v_collabs     text[];
  v_catalogue   text[];
  v_technicien  text;
  v_pack        text;
  v_bon         text;
  v_equip       text;
  v_collab      text;
  v_fil         text;
  v_statut      text;
  v_date        date;
  v_created     timestamptz;
  v_nb_equip    int;
  v_i           int;
  v_j           int;
  v_reference   text;
  v_email       text;
  v_categories  text[] := ARRAY['pc_portable','pc_fixe','ecran','souris','clavier','casque','telephone','housse','dock','cable'];
  v_marques     text[] := ARRAY['Lenovo','Dell','HP','Logitech','Jabra','Samsung','Apple','Targus'];
  v_prenoms     text[] := ARRAY['Camille','Julien','Sofia','Marc','Léa','Thomas','Nadia','Pierre','Chloé','Yanis','Inès','Hugo','Sarah','Antoine','Manon','Karim','Elodie','Mehdi','Claire','Lucas'];
  v_noms        text[] := ARRAY['MARTIN','BERNARD','DUBOIS','THOMAS','ROBERT','PETIT','DURAND','LEROY','MOREAU','SIMON','LAURENT','LEFEBVRE','MICHEL','GARCIA','DAVID','BERTRAND','ROUX','VINCENT','FOURNIER','MOREL'];
  v_services    text[] := ARRAY['Travaux','Bureau d''études','Comptabilité','Ressources humaines','Exploitation','Atelier','Commerce','Direction'];
BEGIN
  -- ── Filiales ───────────────────────────────────────────────────────────────
  FOR v_i IN 1..4 LOOP
    INSERT INTO filiales (id, name, display_name, address, siret, active, created_at, updated_at)
    VALUES (
      gen_random_uuid()::text,
      'DEMO-' || (ARRAY['NORD','SUD','EST','OUEST'])[v_i],
      'Démo ' || (ARRAY['Nord','Sud','Est','Ouest'])[v_i],
      (10 * v_i) || ' rue des Chantiers, 69000 Lyon',
      LPAD((12345678900000 + v_i)::text, 14, '0'),
      true, now(), now()
    );
  END LOOP;
  SELECT array_agg(id ORDER BY name) INTO v_filiales FROM filiales WHERE name LIKE 'DEMO-%';

  -- ── Technicien qui crée les bons ───────────────────────────────────────────
  INSERT INTO users (id, sam_account_name, display_name, email, department, role, is_it_staff,
                     active, is_local_account, is_manual_account, must_change_password, created_at, updated_at)
  VALUES (gen_random_uuid()::text, 'demo.technicien', 'Théo TECHNICIEN', 'theo.technicien@demo.local',
          'Service informatique', 'technician', true, true, false, false, false, now(), now())
  RETURNING id INTO v_technicien;

  -- ── Collaborateurs : 20 avec adresse, 6 créés à la main sans adresse ────────
  FOR v_i IN 1..20 LOOP
    v_email := lower(v_prenoms[v_i]) || '.' || lower(v_noms[v_i]) || '@demo.local';
    v_email := translate(v_email, 'éèêëàâäîïôöûüç', 'eeeeaaaiioouuc');
    INSERT INTO users (id, sam_account_name, display_name, email, department, filiale_id, role,
                       is_it_staff, active, is_local_account, is_manual_account, must_change_password,
                       last_ldap_sync, created_at, updated_at)
    VALUES (gen_random_uuid()::text, 'demo.user' || v_i, v_prenoms[v_i] || ' ' || v_noms[v_i], v_email,
            v_services[1 + (v_i % array_length(v_services, 1))],
            v_filiales[1 + (v_i % 4)], 'collaborator', false, true, false, false, false,
            now() - (v_i || ' days')::interval, now() - (v_i || ' days')::interval, now());
  END LOOP;

  FOR v_i IN 1..6 LOOP
    INSERT INTO users (id, sam_account_name, display_name, email, department, filiale_id, role,
                       is_it_staff, active, is_local_account, is_manual_account, must_change_password,
                       created_at, updated_at)
    VALUES (gen_random_uuid()::text, 'demo.chantier' || v_i,
            (ARRAY['Ahmed','Bruno','Cédric','David','Enzo','Farid'])[v_i] || ' COMPAGNON' || v_i,
            NULL, 'Chantier', v_filiales[1 + (v_i % 4)], 'collaborator',
            false, true, false, true, false, now(), now());
  END LOOP;

  SELECT array_agg(id) INTO v_collabs FROM users WHERE sam_account_name LIKE 'demo.user%' OR sam_account_name LIKE 'demo.chantier%';

  -- ── Catalogue : 24 articles ────────────────────────────────────────────────
  FOR v_i IN 1..24 LOOP
    INSERT INTO equipment_catalog (id, category, brand, model, description, active, created_at, updated_at)
    VALUES (gen_random_uuid()::text,
            (v_categories[1 + (v_i % array_length(v_categories, 1))])::"EquipmentCategory",
            v_marques[1 + (v_i % array_length(v_marques, 1))],
            'Modèle ' || v_i,
            '[DEMO] article de démonstration',
            v_i % 11 <> 0,          -- un article sur onze est désactivé
            now(), now());
  END LOOP;
  SELECT array_agg(id) INTO v_catalogue FROM equipment_catalog WHERE description LIKE '[DEMO]%' AND active;

  -- ── Packs ──────────────────────────────────────────────────────────────────
  FOR v_i IN 1..3 LOOP
    INSERT INTO equipment_packs (id, name, description, active, created_at, updated_at)
    VALUES (gen_random_uuid()::text,
            (ARRAY['Poste bureau complet','Poste mobile','Kit chantier'])[v_i],
            '[DEMO] pack de démonstration', true, now(), now())
    RETURNING id INTO v_pack;
    FOR v_j IN 1..3 LOOP
      INSERT INTO equipment_pack_items (id, pack_id, catalog_item_id, quantity)
      VALUES (gen_random_uuid()::text, v_pack, v_catalogue[1 + ((v_i * 3 + v_j) % array_length(v_catalogue, 1))], 1 + (v_j % 2));
    END LOOP;
  END LOOP;

  -- ── Bons : 140 bons répartis sur 12 mois ───────────────────────────────────
  FOR v_i IN 1..140 LOOP
    v_collab := v_collabs[1 + (v_i % array_length(v_collabs, 1))];
    SELECT COALESCE(filiale_id, v_filiales[1]) INTO v_fil FROM users WHERE id = v_collab;
    v_created := now() - ((360 - (v_i * 2.5))::int || ' days')::interval - ((v_i % 9) || ' hours')::interval;
    v_date := v_created::date;

    -- Répartition réaliste des statuts
    v_statut := CASE
      WHEN v_i % 20 = 0 THEN 'cancelled'
      WHEN v_i % 17 = 0 THEN 'contested'
      WHEN v_i % 13 = 0 THEN 'partially_returned'
      WHEN v_i % 11 = 0 THEN 'sent_restitution'
      WHEN v_i % 7  = 0 THEN 'sent_mise_dispo'
      WHEN v_i % 3  = 0 THEN 'active'
      WHEN v_i % 29 = 0 THEN 'draft'
      ELSE 'archived'
    END;

    v_reference := 'BON-' || to_char(v_created, 'YYYY') || '-D' || LPAD(v_i::text, 4, '0');

    INSERT INTO bons (id, reference, filiale_id, collaborateur_id, collaborateur_email, created_by_id,
                      civilite, status, date_mise_disposition, date_restitution, notes,
                      archived_at, created_at, updated_at)
    SELECT gen_random_uuid()::text, v_reference, v_fil, v_collab, u.email, v_technicien,
           (CASE WHEN v_i % 2 = 0 THEN 'mme' ELSE 'mr' END)::"Civilite",
           v_statut::"BonStatus",
           v_date,
           CASE WHEN v_i % 4 = 0 THEN v_date + 180 ELSE NULL END,
           '[DEMO] bon de démonstration',
           CASE WHEN v_statut = 'archived' THEN v_created + interval '25 days' ELSE NULL END,
           v_created,
           v_created + interval '1 day'
    FROM users u WHERE u.id = v_collab
    RETURNING id INTO v_bon;

    -- Équipements du bon
    v_nb_equip := 1 + (v_i % 4);
    FOR v_j IN 1..v_nb_equip LOOP
      INSERT INTO bon_equipments (id, bon_id, catalog_item_id, custom_label, serial_number,
                                  inventory_number, "order", returned_at, not_returned,
                                  not_returned_reason, created_at)
      VALUES (
        gen_random_uuid()::text, v_bon,
        CASE WHEN v_j = 1 AND v_i % 8 = 0 THEN NULL ELSE v_catalogue[1 + ((v_i + v_j) % array_length(v_catalogue, 1))] END,
        CASE WHEN v_j = 1 AND v_i % 8 = 0 THEN 'Matériel hors catalogue ' || v_i ELSE NULL END,
        'SN-DEMO-' || LPAD(v_i::text, 4, '0') || '-' || v_j,
        CASE WHEN v_i % 5 = 0 THEN 'INV-' || LPAD(v_i::text, 5, '0') ELSE NULL END,
        v_j,
        CASE WHEN v_statut = 'archived' THEN v_created + interval '25 days'
             WHEN v_statut = 'partially_returned' AND v_j = 1 THEN v_created + interval '20 days'
             ELSE NULL END,
        CASE WHEN v_statut = 'archived' AND v_i % 23 = 0 AND v_j = 1 THEN true ELSE false END,
        CASE WHEN v_statut = 'archived' AND v_i % 23 = 0 AND v_j = 1 THEN 'Matériel déclaré perdu par le collaborateur' ELSE NULL END,
        v_created);
    END LOOP;

    -- Signatures : cachet informatique + collaborateur selon l'avancement
    IF v_statut <> 'draft' AND v_statut <> 'cancelled' THEN
      INSERT INTO signatures (id, bon_id, type, token, token_expires_at, signed, signed_at,
                              signer_email, mention_lu_approuve, is_in_person, signed_by_proxy, created_at)
      VALUES (gen_random_uuid()::text, v_bon, 'it_cachet', gen_random_uuid()::text,
              v_created + interval '7 days', true, v_created + interval '1 hour',
              'theo.technicien@demo.local', true, false, false, v_created);
    END IF;

    IF v_statut IN ('active','sent_restitution','partially_returned','archived','contested') THEN
      INSERT INTO signatures (id, bon_id, type, token, token_expires_at, signed, signed_at,
                              signer_email, mention_lu_approuve, is_in_person, signed_by_proxy, created_at)
      SELECT gen_random_uuid()::text, v_bon, 'mise_disposition', gen_random_uuid()::text,
             v_created + interval '7 days', true,
             v_created + ((1 + (v_i % 60)) || ' hours')::interval,
             u.email, true, u.email IS NULL, u.email IS NULL, v_created
      FROM users u WHERE u.id = v_collab;
    ELSIF v_statut = 'sent_mise_dispo' THEN
      INSERT INTO signatures (id, bon_id, type, token, token_expires_at, signed, created_at)
      VALUES (gen_random_uuid()::text, v_bon, 'mise_disposition', gen_random_uuid()::text,
              v_created + interval '7 days', false, v_created);
    END IF;

    IF v_statut = 'archived' THEN
      INSERT INTO signatures (id, bon_id, type, token, token_expires_at, signed, signed_at,
                              signer_email, mention_lu_approuve, is_in_person, signed_by_proxy, created_at)
      SELECT gen_random_uuid()::text, v_bon, 'restitution', gen_random_uuid()::text,
             v_created + interval '30 days', true, v_created + interval '25 days',
             u.email, true, u.email IS NULL, u.email IS NULL, v_created + interval '24 days'
      FROM users u WHERE u.id = v_collab;
    ELSIF v_statut = 'sent_restitution' THEN
      INSERT INTO signatures (id, bon_id, type, token, token_expires_at, signed, created_at)
      VALUES (gen_random_uuid()::text, v_bon, 'restitution', gen_random_uuid()::text,
              now() + interval '5 days', false, now() - interval '3 days');
    END IF;

    -- Emails envoyés (alimente les indicateurs d'incidents et de rappels)
    IF v_statut <> 'draft' THEN
      INSERT INTO notification_logs (id, bon_id, recipient_email, type, sent_at, status, reminder_number)
      SELECT gen_random_uuid()::text, v_bon, COALESCE(u.email, 'presentiel@demo.local'),
             'mise_dispo_request', v_created + interval '10 minutes',
             (CASE WHEN v_i % 19 = 0 THEN 'failed' ELSE 'sent' END)::"NotificationStatus", NULL
      FROM users u WHERE u.id = v_collab AND u.email IS NOT NULL;

      IF v_statut IN ('sent_mise_dispo','sent_restitution') AND v_i % 2 = 0 THEN
        INSERT INTO notification_logs (id, bon_id, recipient_email, type, sent_at, status, reminder_number)
        SELECT gen_random_uuid()::text, v_bon, u.email, 'reminder',
               v_created + ((3 + rang) || ' days')::interval, 'sent', rang
        FROM users u, generate_series(1, 1 + (v_i % 3)) AS rang
        WHERE u.id = v_collab AND u.email IS NOT NULL;
      END IF;
    END IF;

    -- Contestation sur les bons contestés
    IF v_statut = 'contested' THEN
      INSERT INTO contestations (id, bon_id, user_id, message, status, created_at, updated_at)
      VALUES (gen_random_uuid()::text, v_bon, v_collab,
              'Le numéro de série du poste ne correspond pas à celui qui m''a été remis.',
              (CASE WHEN v_i % 34 = 0 THEN 'resolved' ELSE 'open' END)::"ContestationStatus",
              v_created + interval '3 days', now());
    END IF;

    -- Journal d'audit : alimente les délais et les incidents du tableau de bord
    INSERT INTO audit_logs (id, bon_id, user_id, user_email, action, details, created_at)
    VALUES (gen_random_uuid()::text, v_bon, v_technicien, 'theo.technicien@demo.local', 'bon_created',
            jsonb_build_object('reference', v_reference), v_created);

    IF v_statut <> 'draft' THEN
      INSERT INTO audit_logs (id, bon_id, user_id, user_email, action, details, created_at)
      VALUES (gen_random_uuid()::text, v_bon, v_technicien, 'theo.technicien@demo.local', 'bon_sent',
              jsonb_build_object('inPerson', (v_i % 6 = 0)), v_created + interval '15 minutes');
    END IF;

    IF v_statut = 'cancelled' THEN
      INSERT INTO audit_logs (id, bon_id, user_id, user_email, action, details, created_at)
      VALUES (gen_random_uuid()::text, v_bon, v_technicien, 'theo.technicien@demo.local', 'bon_cancelled',
              jsonb_build_object('reason', 'Erreur de saisie'), v_created + interval '2 days');
    END IF;

    IF v_statut = 'archived' AND v_i % 23 = 0 THEN
      INSERT INTO audit_logs (id, bon_id, user_id, user_email, action, details, created_at)
      VALUES (gen_random_uuid()::text, v_bon, v_technicien, 'theo.technicien@demo.local', 'declare_not_returned',
              jsonb_build_object('count', 1), v_created + interval '24 days');
      IF v_i % 46 = 0 THEN
        INSERT INTO audit_logs (id, bon_id, user_id, user_email, action, details, created_at)
        VALUES (gen_random_uuid()::text, v_bon, v_technicien, 'theo.technicien@demo.local', 'mark_found',
                jsonb_build_object('count', 1), v_created + interval '40 days');
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ── Contrôle ────────────────────────────────────────────────────────────────
SELECT 'filiales'      AS objet, count(*) FROM filiales WHERE name LIKE 'DEMO-%'
UNION ALL SELECT 'collaborateurs', count(*) FROM users WHERE sam_account_name LIKE 'demo.%'
UNION ALL SELECT 'catalogue',      count(*) FROM equipment_catalog WHERE description LIKE '[DEMO]%'
UNION ALL SELECT 'packs',          count(*) FROM equipment_packs WHERE description LIKE '[DEMO]%'
UNION ALL SELECT 'bons',           count(*) FROM bons WHERE notes LIKE '[DEMO]%'
UNION ALL SELECT 'équipements',    count(*) FROM bon_equipments WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%')
UNION ALL SELECT 'signatures',     count(*) FROM signatures WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%')
UNION ALL SELECT 'emails',         count(*) FROM notification_logs WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%')
UNION ALL SELECT 'contestations',  count(*) FROM contestations WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');

-- ── Suppression complète des données de démonstration ───────────────────────
-- BEGIN;
-- DELETE FROM audit_logs WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
-- DELETE FROM notification_logs WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
-- DELETE FROM contestations WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
-- DELETE FROM signatures WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
-- DELETE FROM bon_equipments WHERE bon_id IN (SELECT id FROM bons WHERE notes LIKE '[DEMO]%');
-- DELETE FROM bons WHERE notes LIKE '[DEMO]%';
-- DELETE FROM equipment_pack_items WHERE pack_id IN (SELECT id FROM equipment_packs WHERE description LIKE '[DEMO]%');
-- DELETE FROM equipment_packs WHERE description LIKE '[DEMO]%';
-- DELETE FROM equipment_catalog WHERE description LIKE '[DEMO]%';
-- DELETE FROM users WHERE sam_account_name LIKE 'demo.%';
-- DELETE FROM filiales WHERE name LIKE 'DEMO-%';
-- COMMIT;
