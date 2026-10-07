-- Nome di riserva per i giochi rimossi da Steam (appdetails non risponde piu'): preso da IsThereAnyDeal
ALTER TABLE tracked_game ADD COLUMN name TEXT;
