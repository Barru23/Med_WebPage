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
