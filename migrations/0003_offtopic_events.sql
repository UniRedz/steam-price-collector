-- Periodi di recensioni fuori tema (review bomb) che Steam esclude dal punteggio: [[inizio, fine], ...]
ALTER TABLE review_stats ADD COLUMN offtopic_events_json TEXT NOT NULL DEFAULT '[]'
