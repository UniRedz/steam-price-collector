// Giocatori online (ogni 6 ore). Salva il massimo dei campioni del giorno.
import { assertEnv, query, upsertMany } from "./d1.mjs";
import { steamJson, activeGames, today } from "./steam.mjs";

async function main() {
  assertEnv();
  const started = new Date().toISOString();
  const day = today();
  const games = await activeGames(query, "AND appid NOT IN (SELECT appid FROM game_meta WHERE type IS NOT NULL AND type != 'game')");
  const rows = [];
  for (const { appid } of games) {
    const d = await steamJson(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`, { retries: 2 });
    const r = d?.response;
    if (r?.result === 1 && Number.isFinite(r.player_count)) rows.push([appid, day, r.player_count, 1]);
  }
  await upsertMany("player_daily", ["appid", "day", "peak", "samples"], rows, ["appid", "day"],
    "peak = MAX(peak, excluded.peak), samples = samples + 1");
  await query("INSERT INTO run_log (job, started_at, finished_at, stats_json, ok) VALUES ('players', ?, ?, ?, 1)",
    [started, new Date().toISOString(), JSON.stringify({ games: games.length, sampled: rows.length })]);
  console.log({ games: games.length, sampled: rows.length });
}

main().catch((e) => { console.error(e); process.exit(1); });
