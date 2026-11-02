-- Copertina indicata da Steam (appdetails.header_image). Per i giochi recenti il percorso contiene un codice e l'indirizzo
-- storico .../steam/apps/<appid>/header.jpg risponde 404 (71 giochi su 1.152 il 2 novembre 2026): il sito usa questa
-- quando c'e', altrimenti l'indirizzo storico.
ALTER TABLE game_meta ADD COLUMN header_image TEXT;
