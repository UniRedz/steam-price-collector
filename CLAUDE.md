# Regole del progetto (collector)

- Versioni `0.MINORE.PATCH` con patch a due cifre (0.1.01, 0.1.02…). Serie 0.1; 0.2 solo con cambiamenti grossi decisi da Luca.
- Ogni push fa salire la patch: aggiorna `VERSION` e crea il tag `v0.1.xx`. In `package.json` senza zero iniziale (0.1.02 → `0.1.2`).
- Il messaggio di commit inizia con la versione: `0.1.03: …`.
- Credenziali solo nei secret di GitHub Actions, mai nella repo (è pubblica).
