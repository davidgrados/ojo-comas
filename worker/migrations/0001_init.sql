-- Migracion inicial de Ojo Comas (prototipo de demostracion).
--
-- Ley N° 29733 (Proteccion de Datos Personales): la tabla guarda lo minimo indispensable.
--   * `contact` es NULL salvo que el vecino marque el consentimiento informado.
--   * `ip_hash` nunca se expone por la API; es un SHA-256 con sal diaria y rotatoria que solo
--     sirve para limitar abusos, no para identificar a nadie.
--   * No se guardan DNI, nombres, correo ni telefono mas alla del contacto opcional.

CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT    NOT NULL,
  description   TEXT,
  latitude      REAL    NOT NULL,
  longitude     REAL    NOT NULL,
  zona          TEXT    NOT NULL,
  address       TEXT,
  photo_key     TEXT,
  status        TEXT    NOT NULL DEFAULT 'pendiente',
  confirmations INTEGER NOT NULL DEFAULT 0,
  contact       TEXT,
  consent       INTEGER NOT NULL DEFAULT 0,
  ip_hash       TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT c_category  CHECK (category IN ('bache','basura','alumbrado','otro')),
  CONSTRAINT c_status    CHECK (status IN ('pendiente','en_proceso','resuelto')),
  CONSTRAINT c_zona      CHECK (zona GLOB '0[1-9]' OR zona GLOB '1[0-4]'),
  CONSTRAINT c_lat       CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT c_lng       CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT c_desc      CHECK (description IS NULL OR length(description) <= 140),
  CONSTRAINT c_consent   CHECK (consent IN (0,1)),
  -- Privacidad por diseno: no puede existir contacto sin consentimiento explicito.
  CONSTRAINT c_contacto  CHECK (contact IS NULL OR consent = 1)
);

CREATE INDEX IF NOT EXISTS idx_reports_zona    ON reports (zona);
CREATE INDEX IF NOT EXISTS idx_reports_status  ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_iphora  ON reports (ip_hash, created_at);

-- Trazabilidad del seguimiento: cada cambio de estado queda registrado (transparencia).
CREATE TABLE IF NOT EXISTS status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  status     TEXT    NOT NULL,
  note       TEXT,
  changed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT c_hist_status CHECK (status IN ('pendiente','en_proceso','resuelto'))
);

CREATE INDEX IF NOT EXISTS idx_history_report ON status_history (report_id, changed_at);

-- Apoyo vecinal (Ley N° 27972, Art. 53: participacion vecinal). La clave primaria compuesta
-- impide que el mismo hash de IP apoye dos veces el mismo reporte.
CREATE TABLE IF NOT EXISTS confirmations (
  report_id  INTEGER NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  ip_hash    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (report_id, ip_hash)
);
