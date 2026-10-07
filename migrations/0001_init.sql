-- Giochi tracciati: popolari + wishlist utenti
CREATE TABLE IF NOT EXISTS tracked_game (
  appid       INTEGER PRIMARY KEY,
  itad_id     TEXT,
  origin      TEXT NOT NULL DEFAULT 'top',      -- top | wishlist | manual
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT,                             -- ultimo fetch Steam riuscito
  active      INTEGER NOT NULL DEFAULT 1
);

-- Una riga per gioco per giorno, solo se almeno una regione e' cambiata.
-- prices_json: {"us":["USD",initial,final,cut], "ar":[...], ...} prezzi in centesimi interi
CREATE TABLE IF NOT EXISTS price_snapshot (
  appid        INTEGER NOT NULL,
  day          TEXT    NOT NULL,                -- YYYY-MM-DD UTC
  prices_json  TEXT    NOT NULL,
  source       TEXT    NOT NULL DEFAULT 'steam',
  fetched_at   TEXT    NOT NULL,
  PRIMARY KEY (appid, day)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_day ON price_snapshot(day);

-- Ultimo stato per gioco: evita di rileggere lo storico per il confronto
CREATE TABLE IF NOT EXISTS price_latest (
  appid        INTEGER PRIMARY KEY,
  prices_json  TEXT NOT NULL,
  hash         TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Minimo storico per regione da fonti esterne, usato SOLO se la regione e' verificata
CREATE TABLE IF NOT EXISTS external_low (
  appid       INTEGER NOT NULL,
  region      TEXT    NOT NULL,
  source      TEXT    NOT NULL,                 -- itad
  currency    TEXT    NOT NULL,
  low_int     INTEGER NOT NULL,
  low_cut     INTEGER,
  low_at      TEXT,
  fetched_at  TEXT    NOT NULL,
  PRIMARY KEY (appid, region, source)
);

-- Affidabilita' della fonte esterna per regione (confronto con prezzi Steam reali)
CREATE TABLE IF NOT EXISTS region_trust (
  region      TEXT NOT NULL,
  source      TEXT NOT NULL,
  checked     INTEGER NOT NULL,
  matched     INTEGER NOT NULL,
  trusted     INTEGER NOT NULL,                 -- 1 se match >= 98%
  checked_at  TEXT NOT NULL,
  PRIMARY KEY (region, source)
);

-- Log dei run per debug e monitoraggio
CREATE TABLE IF NOT EXISTS run_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job         TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  stats_json  TEXT,
  ok          INTEGER
);
