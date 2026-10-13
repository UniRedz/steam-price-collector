// Storico completo dei cambi prezzo su Steam da ITAD, per i giochi che non ce l'hanno ancora.
// Serve una volta per gioco e per regione: da li' in avanti lo storico lo raccoglie il collector ogni giorno, e quello
// gia' scaricato resta nel nostro database anche se ITAD smettesse di rispondere.
// Regioni: USA (riferimento per tutte) e poi quelle in cui ITAD riporta i prezzi Steam esatti (tabella region_trust,
// verificata ogni settimana dal job itad). Li' lo storico e' quello vero della regione, con gli importi in valuta.
// Eccezione: se ITAD ha risposto con uno storico vuoto per un gioco gia' uscito e a pagamento, si riprova una volta
// a settimana. Senza storico quel gioco resta "Dati limitati" sul sito, e ITAD puo' averlo indicizzato nel frattempo.
// HISTORY_MAX limita le richieste per run, su tutte le regioni insieme (rate limit ITAD: 100 richieste / 5 minuti
// senza email verificata). HISTORY_REGIONS (es. "us,it") limita le regioni di una run manuale.
import { assertEnv, query, upsertMany } from "./d1.mjs";
import { itad, KEY } from "./itad-client.mjs";

const MAX = Number(process.env.HISTORY_MAX || 1500);
const REFERENCE = "us";
const FIRST = ["it"]; // dopo gli USA l'area euro: e' la regione con piu' visitatori
const RETRY_EMPTY_DAYS = 7;
const COLS = ["appid", "region", "currency", "events_json", "fetched_at"];
const ON_CONFLICT = "currency = excluded.currency, events_json = excluded.events_json, fetched_at = excluded.fetched_at";

// USA sempre; le altre solo se ITAD e' verificato per quella regione
async function regionsToFill() {
  const trusted = (await query("SELECT region FROM region_trust WHERE source = 'itad' AND trusted = 1")).map((r) => r.region);
  const all = [REFERENCE, ...FIRST.filter((r) => trusted.includes(r)), ...trusted.filter((r) => r !== REFERENCE && !FIRST.includes(r)).sort()];
  const only = (process.env.HISTORY_REGIONS || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  return only.length ? all.filter((r) => only.includes(r)) : all;
}

async function download(region, max, only, retryBefore) {
  const games = await query(
    `SELECT appid, itad_id FROM tracked_game
     WHERE active = 1 AND itad_id IS NOT NULL ${only.length ? `AND appid IN (${only.join(",")})` : ""}
       AND (appid NOT IN (SELECT appid FROM itad_history WHERE region = ?)
         OR appid IN (
           SELECT h.appid FROM itad_history h JOIN game_meta m ON m.appid = h.appid
           WHERE h.region = ? AND h.events_json = '[]' AND h.fetched_at < ?
             AND m.is_free = 0 AND m.coming_soon = 0 AND m.type IN ('game', 'dlc')))
     ORDER BY (origin = 'wishlist') DESC, appid LIMIT ?`, [region, region, retryBefore, max]);
  console.log(`${region}: storico ITAD da scaricare per ${games.length} giochi`);
  const rows = [];
  let events = 0, i = 0;
  for (const g of games) {
    i++;
    const h = await itad(`/games/history/v2?id=${g.itad_id}&country=${region.toUpperCase()}&shops=61&since=2000-01-01T00:00:00Z`);
    if (!Array.isArray(h)) continue;
    const ev = h
      .filter((e) => e.shop?.id === 61 && e.deal?.price)
      .map((e) => [e.timestamp, e.deal.regular.amountInt, e.deal.price.amountInt, e.deal.cut])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const currency = h.find((e) => e.deal?.price)?.deal.price.currency ?? null;
    rows.push([g.appid, region, currency, JSON.stringify(ev), new Date().toISOString()]);
    events += ev.length;
    if (rows.length >= 20) await upsertMany("itad_history", COLS, rows.splice(0), ["appid", "region"], ON_CONFLICT);
    if (i % 50 === 0) console.log(`  ${region} ${i}/${games.length}`);
  }
  if (rows.length) await upsertMany("itad_history", COLS, rows, ["appid", "region"], ON_CONFLICT);
  return { games: games.length, events };
}

async function main() {
  assertEnv();
  if (!KEY) throw new Error("ITAD_API_KEY mancante");
  const started = new Date().toISOString();
  const only = (process.env.APPIDS || "").split(",").map(Number).filter(Boolean);
  const retryBefore = new Date(Date.now() - RETRY_EMPTY_DAYS * 86_400_000).toISOString();
  const regions = await regionsToFill();
  console.log(`Regioni: ${regions.join(", ")} (massimo ${MAX} richieste in questa run)`);
  const stats = { games: 0, events: 0, regions: {} };
  for (const region of regions) {
    if (stats.games >= MAX) break;
    const done = await download(region, MAX - stats.games, only, retryBefore);
    stats.games += done.games;
    stats.events += done.events;
    if (done.games) stats.regions[region] = done.games;
  }
  console.log(stats);
  await query("INSERT INTO run_log (job, started_at, finished_at, stats_json, ok) VALUES ('itad-history', ?, ?, ?, 1)",
    [started, new Date().toISOString(), JSON.stringify(stats)]);
}

main().catch((e) => { console.error(e); process.exit(1); });
