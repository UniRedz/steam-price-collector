// Metadati e annunci degli sviluppatori (settimanale + giochi nuovi).
//   node src/meta.mjs            -> tutti i giochi attivi
//   node src/meta.mjs --missing  -> solo quelli senza metadati
import { assertEnv, query, upsertMany } from "./d1.mjs";
import { steamJson, activeGames } from "./steam.mjs";

const LIMIT = Number(process.env.LIMIT || 0);
const MISSING = process.argv.includes("--missing");
const EARLY_ACCESS_GENRE = 70;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// "Jul 6, 2026" | "6 Jul, 2026" -> "2026-07-06"; formati vaghi ("Q4 2026", "Coming soon") -> null
export function parseReleaseDate(s) {
  if (!s) return null;
  let m = /^([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})$/.exec(s.trim()) || null;
  let d, mo, y;
  if (m) { mo = MONTHS[m[1].toLowerCase()]; d = +m[2]; y = +m[3]; }
  else if ((m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]*,? (\d{4})$/.exec(s.trim()))) { d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = +m[3]; }
  if (!mo || !d || !y) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function details(appid) {
  const d = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`);
  const v = d?.[appid];
  if (!v?.success || !v.data) return null;
  const x = v.data;
  const genres = (x.genres || []).map((g) => Number(g.id));
  return {
    name: x.name, type: x.type, is_free: x.is_free ? 1 : 0,
    coming_soon: x.release_date?.coming_soon ? 1 : 0,
    release_date: parseReleaseDate(x.release_date?.date),
    early_access: genres.includes(EARLY_ACCESS_GENRE) ? 1 : 0,
    categories_json: JSON.stringify((x.categories || []).map((c) => Number(c.id))),
    genres_json: JSON.stringify(genres),
    developers_json: JSON.stringify(x.developers || []),
    publishers_json: JSON.stringify(x.publishers || []),
    fullgame_appid: x.fullgame?.appid ? Number(x.fullgame.appid) : null,
    languages: (x.supported_languages || "").replace(/<[^>]+>/g, "").slice(0, 2000),
  };
}

async function devNews(appid) {
  const d = await steamJson(
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=10&maxlength=1&feeds=steam_community_announcements`);
  const items = d?.appnews?.newsitems;
  if (!Array.isArray(items)) return null;
  const iso = (n) => (n ? new Date(n.date * 1000).toISOString() : null);
  return {
    last_post_at: iso(items[0]),
    last_patch_at: iso(items.find((n) => (n.tags || []).includes("patchnotes"))),
    posts_seen: items.length,
  };
}

async function main() {
  assertEnv();
  const started = new Date().toISOString();
  let games = await activeGames(query, MISSING ? "AND appid NOT IN (SELECT appid FROM game_meta)" : "");
  if (LIMIT) games = games.slice(0, LIMIT);
  console.log(`Metadati: ${games.length} giochi`);
  const metaCols = ["appid", "name", "type", "is_free", "coming_soon", "release_date", "early_access", "categories_json",
    "genres_json", "developers_json", "publishers_json", "fullgame_appid", "languages", "updated_at"];
  const newsCols = ["appid", "last_post_at", "last_patch_at", "posts_seen", "updated_at"];
  let metaRows = [], newsRows = [], i = 0;
  const flush = async () => {
    if (metaRows.length) await upsertMany("game_meta", metaCols, metaRows.splice(0), ["appid"], metaCols.slice(1).map((c) => `${c} = excluded.${c}`).join(", "));
    if (newsRows.length) await upsertMany("dev_news", newsCols, newsRows.splice(0), ["appid"], newsCols.slice(1).map((c) => `${c} = excluded.${c}`).join(", "));
  };
  for (const { appid } of games) {
    i++;
    const now = new Date().toISOString();
    const m = await details(appid);
    if (m) metaRows.push(metaCols.map((c) => (c === "appid" ? appid : c === "updated_at" ? now : m[c])));
    const n = await devNews(appid);
    if (n) newsRows.push([appid, n.last_post_at, n.last_patch_at, n.posts_seen, now]);
    if (metaRows.length >= 20) await flush();
    if (i % 100 === 0) console.log(`  ${i}/${games.length}`);
  }
  await flush();
  await query("INSERT INTO run_log (job, started_at, finished_at, stats_json, ok) VALUES ('meta', ?, ?, ?, 1)",
    [started, new Date().toISOString(), JSON.stringify({ games: games.length })]);
  console.log("ok");
}

if (process.argv[1]?.endsWith("meta.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
