// Setup iniziale e manutenzione della lista giochi.
//   node src/seed.mjs top [N]                -> aggiunge i N giochi piu' in wishlist su ITAD (default 1000)
//   node src/seed.mjs wishlist <steamid64>   -> aggiunge la wishlist pubblica di un profilo
//   node src/seed.mjs import <file.json.gz>  -> importa uno snapshot one-shot (es. Autumn Sale 2026)
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash as sha } from "node:crypto";
import { assertEnv, query, insertMany, sleep } from "./d1.mjs";

const [, , cmd, arg] = process.argv;
const KEY = process.env.ITAD_API_KEY;

async function addGames(appids, origin) {
  const rows = [...new Set(appids)].map((a) => [a, origin]);
  await insertMany("tracked_game", ["appid", "origin"], rows, "OR IGNORE");
  console.log(`${rows.length} giochi proposti (${origin}), duplicati ignorati`);
}

async function top(n = 1000) {
  if (!KEY) throw new Error("ITAD_API_KEY mancante");
  const ids = [];
  for (let off = 0; off < n; off += 500) {
    const r = await fetch(`https://api.isthereanydeal.com/stats/most-waitlisted/v1?key=${KEY}&limit=${Math.min(500, n - off)}&offset=${off}`);
    ids.push(...(await r.json()).map((g) => g.id));
    await sleep(3200);
  }
  const appids = [];
  for (let i = 0; i < ids.length; i += 200) {
    const r = await fetch(`https://api.isthereanydeal.com/lookup/shop/61/id/v1?key=${KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids.slice(i, i + 200)),
    });
    for (const list of Object.values(await r.json())) for (const s of list || []) if (s.startsWith("app/")) appids.push(Number(s.slice(4)));
    await sleep(3200);
  }
  await addGames(appids, "top");
}

async function wishlist(steamid) {
  const r = await fetch(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamid}`);
  const items = (await r.json()).response?.items || [];
  if (!items.length) throw new Error("Wishlist vuota o privata");
  await addGames(items.map((i) => i.appid), "wishlist");
}

async function importSnapshot(file) {
  const raw = JSON.parse(gunzipSync(readFileSync(file)).toString());
  const day = raw.ts.slice(0, 10);
  const byApp = new Map();
  for (const [cc, apps] of Object.entries(raw.regions)) {
    for (const [appid, p] of Object.entries(apps)) {
      if (!byApp.has(appid)) byApp.set(appid, {});
      byApp.get(appid)[cc] = p;
    }
  }
  const snap = [], latest = [];
  for (const [appid, p] of byApp) {
    const json = JSON.stringify(Object.keys(p).sort().reduce((a, k) => ((a[k] = p[k]), a), {}));
    snap.push([Number(appid), day, json, "steam", raw.ts]);
    latest.push([Number(appid), json, sha("sha1").update(json).digest("hex"), raw.ts]);
  }
  await addGames([...byApp.keys()].map(Number), "top");
  await insertMany("price_snapshot", ["appid", "day", "prices_json", "source", "fetched_at"], snap, "OR IGNORE");
  // price_latest solo se non c'e' gia' un dato piu' recente
  await insertMany("price_latest", ["appid", "prices_json", "hash", "updated_at"], latest, "OR IGNORE");
  console.log(`Importati ${snap.length} giochi del ${day}`);
}

assertEnv();
const run = { top: () => top(Number(arg) || 1000), wishlist: () => wishlist(arg), import: () => importSnapshot(arg) }[cmd];
if (!run) { console.log("Uso: seed.mjs top [N] | wishlist <steamid64> | import <file.json.gz>"); process.exit(1); }
run().catch((e) => { console.error(e); process.exit(1); });
