# steam-price-collector

Snapshot giornaliero dei prezzi Steam in 40 regioni di prezzo, salvato su Cloudflare D1. Zero dipendenze, zero costi.

- **collect** (ogni giorno, 03:17 UTC): prezzi Steam per tutti i giochi tracciati in tutte le regioni. Scrive una riga per gioco solo se almeno un prezzo è cambiato.
- **itad** (il lunedì): verifica per ogni regione se IsThereAnyDeal riporta esattamente i prezzi Steam reali. Solo per le regioni verificate salva il minimo storico Steam. Le altre regioni usano solo lo storico interno.

## Setup

1. Cloudflare: crea un database D1 e un API token con permesso `D1:Edit`.
2. GitHub → Settings → Secrets and variables → Actions, aggiungi:
   `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_API_TOKEN`, `ITAD_API_KEY`.
3. Actions → **setup** → Run workflow → `all-initial` (migration, import Autumn Sale 2026, top 1000 giochi).
4. Il job **collect** parte da solo ogni notte. Per lanciarlo subito: Actions → collect → Run workflow.

## Dati

| Tabella | Contenuto |
|---|---|
| `tracked_game` | Giochi tracciati (top, wishlist, manual) |
| `price_snapshot` | Una riga per gioco per giorno di cambio: `{"ar":["USD",initial,final,cut],...}` in centesimi |
| `price_latest` | Ultimo stato per gioco |
| `external_low` | Minimo storico Steam da ITAD, solo per regioni verificate |
| `region_trust` | Esito della verifica ITAD per regione |
| `run_log` | Log dei run |

`data/autumn_sale_2026-10-07.json.gz`: snapshot dell'Autumn Sale 2026, 40 regioni, 749 giochi.

## Test locale

`CF_API_BASE` permette di puntare a un mock dell'API D1. Le chiavi non vanno mai nel codice né in file committati.
