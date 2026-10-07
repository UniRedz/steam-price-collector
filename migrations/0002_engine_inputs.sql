-- Dati per il decision engine

-- Metadati del gioco (settimanale)
CREATE TABLE IF NOT EXISTS game_meta (
  appid           INTEGER PRIMARY KEY,
  name            TEXT,
  type            TEXT,                 -- game | dlc | ...
  is_free         INTEGER NOT NULL DEFAULT 0,
  coming_soon     INTEGER NOT NULL DEFAULT 0,
  release_date    TEXT,                 -- YYYY-MM-DD, NULL se non interpretabile
  early_access    INTEGER NOT NULL DEFAULT 0,
  categories_json TEXT NOT NULL DEFAULT '[]',  -- id categorie Steam
  genres_json     TEXT NOT NULL DEFAULT '[]',  -- id generi Steam
  developers_json TEXT NOT NULL DEFAULT '[]',
  publishers_json TEXT NOT NULL DEFAULT '[]',
  fullgame_appid  INTEGER,              -- per i DLC: gioco base richiesto
  languages       TEXT,                 -- stringa supported_languages di Steam
  updated_at      TEXT NOT NULL
);

-- Recensioni (giornaliero): totali tutte le lingue/acquisti + ultimi 30 giorni giorno per giorno
CREATE TABLE IF NOT EXISTS review_stats (
  appid                INTEGER PRIMARY KEY,
  total                INTEGER NOT NULL,
  positive             INTEGER NOT NULL,
  score_desc           TEXT,
  total_incl_offtopic  INTEGER,         -- settimanale: totale includendo i review bomb fuori tema
  recent_json          TEXT NOT NULL DEFAULT '[]',  -- [[day, up, down], ...] ultimi 30 giorni
  updated_at           TEXT NOT NULL
);

-- Motivi delle recensioni negative (settimanale, solo giochi con recensioni sotto il 75%)
CREATE TABLE IF NOT EXISTS review_negatives (
  appid           INTEGER PRIMARY KEY,
  sample          INTEGER NOT NULL,     -- recensioni negative analizzate
  language        TEXT NOT NULL,
  categories_json TEXT NOT NULL,        -- {"bugs": 0.34, ...} quota di recensioni che citano la categoria
  top_excerpt     TEXT,                 -- estratto della negativa piu' votata come utile (ultimi 180 giorni)
  top_votes       INTEGER,
  top_date        TEXT,
  updated_at      TEXT NOT NULL
);

-- Giocatori online: massimo dei campioni raccolti nel giorno (ogni 6 ore)
CREATE TABLE IF NOT EXISTS player_daily (
  appid    INTEGER NOT NULL,
  day      TEXT    NOT NULL,
  peak     INTEGER NOT NULL,
  samples  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (appid, day)
);

-- Annunci degli sviluppatori su Steam (settimanale)
CREATE TABLE IF NOT EXISTS dev_news (
  appid          INTEGER PRIMARY KEY,
  last_post_at   TEXT,
  last_patch_at  TEXT,
  posts_seen     INTEGER NOT NULL,      -- annunci trovati (max 10 letti)
  updated_at     TEXT NOT NULL
);

-- Storico completo dei cambi prezzo Steam da ITAD: una riga per gioco/regione, eventi in JSON
-- events_json: [[iso_ts, regular_int, price_int, cut], ...] dal piu' vecchio al piu' recente
CREATE TABLE IF NOT EXISTS itad_history (
  appid       INTEGER NOT NULL,
  region      TEXT    NOT NULL,
  currency    TEXT,
  events_json TEXT    NOT NULL,
  fetched_at  TEXT    NOT NULL,
  PRIMARY KEY (appid, region)
);

-- Abbonamenti che includono il gioco (Game Pass, ecc.)
CREATE TABLE IF NOT EXISTS subscription (
  appid       INTEGER NOT NULL,
  country     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  leaving     TEXT,
  fetched_at  TEXT    NOT NULL,
  PRIMARY KEY (appid, country, name)
);

-- Crediti verificabili (sviluppo, publishing, consulenze): solo aziende, mai persone. Fonte obbligatoria.
CREATE TABLE IF NOT EXISTS game_credit (
  appid       INTEGER NOT NULL,
  company     TEXT    NOT NULL,
  role        TEXT    NOT NULL,         -- developer | publisher | consultancy | ...
  source_url  TEXT    NOT NULL,
  added_at    TEXT    NOT NULL,
  PRIMARY KEY (appid, company, role)
);

-- Note di contesto (warning C): bozza -> pubblicata (approvazione manuale) -> archiviata
CREATE TABLE IF NOT EXISTS context_note (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  appid         INTEGER NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'draft',   -- draft | published | archived
  lang          TEXT    NOT NULL DEFAULT 'it',
  title         TEXT    NOT NULL,
  summary       TEXT    NOT NULL,
  sources_json  TEXT    NOT NULL DEFAULT '[]',      -- ["https://...", ...] almeno 2 per pubblicare
  trigger       TEXT,                               -- segnale che l'ha generata
  created_at    TEXT    NOT NULL,
  reviewed_at   TEXT,
  expires_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_note_app ON context_note(appid, status);
