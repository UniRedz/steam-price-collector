// Storico completo dei cambi prezzo su Steam (USA) da ITAD, per i giochi che non ce l'hanno ancora.
// Serve una volta per gioco: da li' in avanti lo storico USA lo raccoglie il collector ogni giorno.
// HISTORY_MAX limita i giochi per run (rate limit ITAD: 100 richieste / 5 minuti senza email verificata).
import { assertEnv, query, upsertMany } from "./d1.mjs";
import { itad, KEY } from "./itad-client.mjs";

const MAX = Number(process.env.HISTORY_MAX || 1500);
const REGION = "us";

async function main() {
  assertEnv();
  if (!KEY) throw new Error("ITAD_API_KEY mancante");
  const started = new Date().toISOString();
  const only = (process.env.APPIDS || "").split(",").map(Number).filter(Boolean);
  const games = await query(
    `SELECT appid, itad_id FROM tracked_game
     WHERE active = 1 AND itad_id IS NOT NULL ${only.length ? `AND appid IN (${only.join(",")})` : ""}
       AND appid NOT IN (SELECT appid FROM itad_history WHERE region = ?)
     ORDER BY (origin = 'wishlist') DESC, appid LIMIT ?`, [REGION, MAX]);
  console.log(`Storico ITAD da scaricare: ${games.length} giochi`);
  const cols = ["appid", "region", "currency", "events_json", "fetched_at"];
  const rows = [];
  let events = 0, i = 0;
  for (const g of games) {
    i++;
    const h = await itad(`/games/history/v2?id=${g.itad_id}&country=${REGION.toUpperCase()}&shops=61&since=2000-01-01T00:00:00Z`);
    if (!Array.isArray(h)) continue;
    const ev = h
      .filter((e) => e.shop?.id === 61 && e.deal?.price)
      .map((e) => [e.timestamp, e.deal.regular.amountInt, e.deal.price.amountInt, e.deal.cut])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const currency = h.find((e) => e.deal?.price)?.deal.price.currency ?? null;
    rows.push([g.appid, REGION, currency, JSON.stringify(ev), new Date().toISOString()]);
    events += ev.length;
    if (rows.length >= 20) await upsertMany("itad_history", cols, rows.splice(0), ["appid", "region"],
      "currency = excluded.currency, events_json = excluded.events_json, fetched_at = excluded.fetched_at");
    if (i % 50 === 0) console.log(`  ${i}/${games.length}`);
  }
  if (rows.length) await upsertMany("itad_history", cols, rows, ["appid", "region"],
    "currency = excluded.currency, events_json = excluded.events_json, fetched_at = excluded.fetched_at");
  const stats = { games: games.length, events };
  console.log(stats);
  await query("INSERT INTO run_log (job, started_at, finished_at, stats_json, ok) VALUES ('itad-history', ?, ?, ?, 1)",
    [started, new Date().toISOString(), JSON.stringify(stats)]);
}

main().catch((e) => { console.error(e); process.exit(1); });
