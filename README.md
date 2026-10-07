# steam-price-collector

Snapshot giornaliero dei prezzi Steam in 40 regioni di prezzo, salvato su Cloudflare D1. Zero dipendenze, zero costi.

Workflow `collect` (ogni giorno alle 03:17 UTC), job in parallelo su runner separati:
- **prices**: prezzi Steam in 40 regioni per tutti i giochi tracciati; una riga per gioco solo se un prezzo è cambiato. Poi i metadati dei giochi nuovi.
- **reviews**: totali recensioni (tutte le lingue), ultimi 30 giorni giorno per giorno e periodi di review bomb esclusi da Steam. Il lunedì anche i motivi delle recensioni negative (classificatore a parole chiave, zero IA) e la negativa più votata.
- **weekly** (lunedì): metadati e annunci degli sviluppatori; verifica ITAD per regione, minimi storici solo dove ITAD coincide al centesimo con Steam, abbonamenti (Game Pass ecc.).
- **itad-history**: storico completo dei prezzi Steam USA da ITAD, una volta per gioco.

Workflow `players` (ogni 6 ore): giocatori online, si salva il massimo del giorno.

Run manuali: `APPIDS=1,2,3` limita qualsiasi job a giochi specifici.

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
| `game_meta` | Tipo, uscita, early access, categorie, sviluppatori, lingue |
| `review_stats` | Recensioni: totali, ultimi 30 giorni, periodi fuori tema |
| `review_negatives` | Motivi delle negative e negativa più votata (giochi sotto il 75%) |
| `player_daily` | Picco giornaliero di giocatori online |
| `dev_news` | Ultimo annuncio e ultima patch degli sviluppatori |
| `itad_history` | Storico completo prezzi Steam USA |
| `subscription` | Abbonamenti che includono il gioco |
| `game_credit` | Crediti verificabili (solo aziende, fonte obbligatoria) |
| `context_note` | Note di contesto: bozza → pubblicata (min. 2 fonti) |
| `run_log` | Log dei run |

`data/autumn_sale_2026-10-07.json.gz`: snapshot dell'Autumn Sale 2026, 40 regioni, 749 giochi.

## Test locale

`CF_API_BASE` permette di puntare a un mock dell'API D1. Le chiavi non vanno mai nel codice né in file committati.
