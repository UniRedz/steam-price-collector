-- Giorno della prima recensione su Steam (start_date dell'istogramma delle recensioni, che il job reviews legge gia' ogni
-- notte). Da quel giorno il gioco e' giocabile, anche in early access; prima c'e' al massimo la prevendita. Il motore lo usa
-- per l'eta' sul mercato: senza, contava il primo prezzo di IsThereAnyDeal, che puo' essere la prevendita (Phantom Blade Zero:
-- prezzo dal 12 agosto 2026, uscito il 28 ottobre, "uscito da 84 giorni" il 4 novembre invece di 7).
ALTER TABLE review_stats ADD COLUMN first_review_at TEXT;
