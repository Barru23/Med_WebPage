-- XIVARRI seed data (CLAUDE.md §4b).
-- Three departments and their seed activities. Idempotent: fixed readable ids
-- + INSERT OR IGNORE, so re-running does not duplicate rows.
--
-- Prices, stock and posters are PLACEHOLDERS for admins to edit — every seed
-- activity is paid (no €0 variants), per §4b. Current edition: "Tardor 2026".

-- ===========================================================================
-- Departments
-- ===========================================================================
INSERT OR IGNORE INTO department (id, slug, position, name_ca, name_es, name_en, photo_url) VALUES
  ('dept_activitats', 'activitats', 0, 'Activitats', 'Actividades', 'Activities', NULL),
  ('dept_festes',     'festes',     1, 'Festes',     'Fiestas',     'Parties',    NULL),
  ('dept_merchan',    'merchan',    2, 'Merchan',    'Merchan',     'Merch',      NULL);

-- ===========================================================================
-- Activitats
-- ===========================================================================
INSERT OR IGNORE INTO activity
  (id, slug, department_id, type, title_ca, poster_url, starts_at, location, edition, published) VALUES
  ('act_medifutbol',      'medifutbol',      'dept_activitats', 'event', 'Medifutbol',                  NULL, NULL, NULL, 'Tardor 2026', 1),
  ('act_medipadel',       'medipadel',       'dept_activitats', 'event', 'Medipadel',                   NULL, NULL, NULL, 'Tardor 2026', 1),
  ('act_mediportaventura','mediportaventura','dept_activitats', 'trip',  'Mediportaventura',            NULL, NULL, 'PortAventura World', 'Tardor 2026', 1),
  ('act_mirona_run',      'mirona-run-club', 'dept_activitats', 'event', 'XIVARRI x Mirona Run Club',   NULL, NULL, NULL, 'Tardor 2026', 1);

-- Medifutbol — event, single "General" entry (§4: party → event + variants).
INSERT OR IGNORE INTO variant (id, activity_id, name_ca, price_cents, stock, position) VALUES
  ('var_medifutbol_general', 'act_medifutbol', 'Inscripció', 500, 100, 0);

-- Medipadel — event, per pair.
INSERT OR IGNORE INTO variant (id, activity_id, name_ca, price_cents, stock, position) VALUES
  ('var_medipadel_parella', 'act_medipadel', 'Parella', 1000, 32, 0);

-- Mediportaventura — trip, amb bus / sense bus + custom fields (§4).
INSERT OR IGNORE INTO variant (id, activity_id, name_ca, price_cents, stock, position) VALUES
  ('var_mpv_ambbus',   'act_mediportaventura', 'Amb bus',   5500, 50, 0),
  ('var_mpv_sensebus', 'act_mediportaventura', 'Sense bus', 4000, 50, 1);

INSERT OR IGNORE INTO field (id, activity_id, position, label_ca, type, options_json, required) VALUES
  ('fld_mpv_dni',       'act_mediportaventura', 0, 'DNI',                    'text',   NULL, 1),
  ('fld_mpv_allergies', 'act_mediportaventura', 1, 'Al·lèrgies',             'text',   NULL, 0),
  ('fld_mpv_emergency', 'act_mediportaventura', 2, 'Contacte d''emergència', 'text',   NULL, 1),
  ('fld_mpv_busstop',   'act_mediportaventura', 3, 'Parada de bus',          'select',
    '[{"value":"girona","ca":"Girona"},{"value":"figueres","ca":"Figueres"},{"value":"barcelona","ca":"Barcelona"}]', 1);

-- XIVARRI x Mirona Run Club — event, one dorsal.
INSERT OR IGNORE INTO variant (id, activity_id, name_ca, price_cents, stock, position) VALUES
  ('var_mirona_dorsal', 'act_mirona_run', 'Dorsal', 800, 150, 0);

-- ===========================================================================
-- Festes
-- ===========================================================================
INSERT OR IGNORE INTO activity
  (id, slug, department_id, type, title_ca, poster_url, starts_at, location, edition, published) VALUES
  ('act_medigala',     'medigala',      'dept_festes', 'event', 'Medigala',      NULL, NULL, NULL, 'Tardor 2026', 1),
  ('act_inici_curs',   'inici-de-curs', 'dept_festes', 'event', 'Inici de curs', NULL, NULL, NULL, 'Tardor 2026', 1);

-- Medigala — party → 2 variants.
INSERT OR IGNORE INTO variant (id, activity_id, name_ca, price_cents, stock, position) VALUES
  ('var_medigala_general', 'act_medigala', 'Entrada general', 1500, 200, 0),
  ('var_medigala_sopar',   'act_medigala', 'Entrada + sopar', 3500, 200, 1);

-- Inici de curs — party → 2 variants.
INSERT OR IGNORE INTO variant (id, activity_id, name_ca, price_cents, stock, position) VALUES
  ('var_inici_antic',    'act_inici_curs', 'Anticipada', 1000, 300, 0),
  ('var_inici_taquilla', 'act_inici_curs', 'Taquilla',   1200, 300, 1);

-- ===========================================================================
-- Merchan — merch product, one variant per size (§4: merch → variant per size).
-- PLACEHOLDER product so the merch path is testable; replace via the admin panel.
-- ===========================================================================
INSERT OR IGNORE INTO activity
  (id, slug, department_id, type, title_ca, poster_url, starts_at, location, edition, published) VALUES
  ('act_dessuadora', 'dessuadora-xivarri', 'dept_merchan', 'merch', 'Dessuadora XIVARRI', NULL, NULL, NULL, NULL, 1);

INSERT OR IGNORE INTO variant (id, activity_id, name_ca, price_cents, stock, position) VALUES
  ('var_dessuadora_s', 'act_dessuadora', 'Talla S', 2500, 20, 0),
  ('var_dessuadora_m', 'act_dessuadora', 'Talla M', 2500, 20, 1),
  ('var_dessuadora_l', 'act_dessuadora', 'Talla L', 2500, 20, 2),
  ('var_dessuadora_xl','act_dessuadora', 'Talla XL',2500, 20, 3);

-- ===========================================================================
-- Edicions (esquema 0010+) i classificació de dades (0013+)
-- ===========================================================================
-- El seed s'executa després de les migracions. Cada activitat necessita una
-- edició actual amb data final perquè la retenció es pugui calcular.
INSERT OR IGNORE INTO activity_edition
  (id, activity_id, label, ends_at, location, published) VALUES
  ('ed_medifutbol_2026',       'act_medifutbol',       'Tardor 2026', '2026-12-31 23:59:59', NULL, 1),
  ('ed_medipadel_2026',        'act_medipadel',        'Tardor 2026', '2026-12-31 23:59:59', NULL, 1),
  ('ed_mediportaventura_2026', 'act_mediportaventura', 'Tardor 2026', '2026-12-31 23:59:59', 'PortAventura World', 1),
  ('ed_mirona_2026',           'act_mirona_run',       'Tardor 2026', '2026-12-31 23:59:59', NULL, 1),
  ('ed_medigala_2026',         'act_medigala',         'Tardor 2026', '2026-12-31 23:59:59', NULL, 1),
  ('ed_inici_curs_2026',       'act_inici_curs',       'Tardor 2026', '2026-12-31 23:59:59', NULL, 1),
  ('ed_dessuadora_2026',       'act_dessuadora',       'Tardor 2026', '2026-12-31 23:59:59', NULL, 1);

UPDATE activity SET current_edition_id = 'ed_medifutbol_2026' WHERE id = 'act_medifutbol';
UPDATE activity SET current_edition_id = 'ed_medipadel_2026' WHERE id = 'act_medipadel';
UPDATE activity SET current_edition_id = 'ed_mediportaventura_2026' WHERE id = 'act_mediportaventura';
UPDATE activity SET current_edition_id = 'ed_mirona_2026' WHERE id = 'act_mirona_run';
UPDATE activity SET current_edition_id = 'ed_medigala_2026' WHERE id = 'act_medigala';
UPDATE activity SET current_edition_id = 'ed_inici_curs_2026' WHERE id = 'act_inici_curs';
UPDATE activity SET current_edition_id = 'ed_dessuadora_2026' WHERE id = 'act_dessuadora';

UPDATE variant SET edition_id = 'ed_medifutbol_2026' WHERE activity_id = 'act_medifutbol';
UPDATE variant SET edition_id = 'ed_medipadel_2026' WHERE activity_id = 'act_medipadel';
UPDATE variant SET edition_id = 'ed_mediportaventura_2026' WHERE activity_id = 'act_mediportaventura';
UPDATE variant SET edition_id = 'ed_mirona_2026' WHERE activity_id = 'act_mirona_run';
UPDATE variant SET edition_id = 'ed_medigala_2026' WHERE activity_id = 'act_medigala';
UPDATE variant SET edition_id = 'ed_inici_curs_2026' WHERE activity_id = 'act_inici_curs';
UPDATE variant SET edition_id = 'ed_dessuadora_2026' WHERE activity_id = 'act_dessuadora';

UPDATE field SET data_classification = 'identity'
 WHERE id IN ('fld_mpv_dni', 'fld_mpv_emergency');
UPDATE field SET data_classification = 'health' WHERE id = 'fld_mpv_allergies';
