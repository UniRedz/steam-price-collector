// Job giornaliero: prezzi Steam per tutte le regioni -> D1 (solo se cambiati).
import { createHash } from "node:crypto";
import { assertEnv, query, insertMany, sleep } from "./d1.mjs";
import { REGIONS } from "./regions.mjs";

const UA = { "User-Agent": "steam-price-collector/1.0 (+https://github.com/UniRedz/steam-price-collector)" };
const BATCH = 100;
const DELAY_MS = Number(process.env.STEAM_DELAY_MS || 1600); // ~190 req / 5 min
const DRY = process.env.DRY_RUN === "1";

async function fetchBatch(ids, cc) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${ids.join(",")}&cc=${cc}&filters=price_overview`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data || typeof data !== "object") throw new Error("risposta vuota");
      return data;
    } catch (e) {
      const wait = 30_000 * attempt;
      console.warn(`  ${cc} batch ${ids[0]}: ${e.message}, retry tra ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  return null; // fail closed: la regione mantiene i valori precedenti
}

const stable = (obj) => JSON.stringify(Object.keys(obj).sort().reduce((a, k) => ((a[k] = obj[k]), a), {}));
const hash = (s) => createHash("sha1").update(s).digest("hex");

async function loadLatest() {
  const map = new Map();
  for (let off = 0; ; off += 2000) {
    const rows = await query("SELECT appid, prices_json, hash FROM price_latest ORDER BY appid LIMIT 2000 OFFSET ?", [off]);
    for (const r of rows) map.set(r.appid, { prices: JSON.parse(r.prices_json), hash: r.hash });
    if (rows.length < 2000) return map;
  }
}

async function main() {
  assertEnv();
  const started = new Date().toISOString();
  const day = started.slice(0, 10);
  const [{ id: runId } = {}] = DRY ? [{}] : await query(
    "INSERT INTO run_log (job, started_at) VALUES ('collect', ?) RETURNING id", [started]);

  const appids = (await query("SELECT appid FROM tracked_game WHERE active = 1 ORDER BY appid")).map((r) => r.appid);
  const latest = await loadLatest();
  console.log(`Giochi: ${appids.length}, regioni: ${REGIONS.length}, stato precedente: ${latest.size}`);

  const prices = new Map(appids.map((a) => [a, {}]));
  const failed = []; // [cc, appid] per batch falliti
  let calls = 0;

  for (const cc of REGIONS) {
    let got = 0;
    for (let i = 0; i < appids.length; i += BATCH) {
      const ids = appids.slice(i, i + BATCH);
      const data = await fetchBatch(ids, cc);
      calls++;
      if (!data) { ids.forEach((a) => failed.push([cc, a])); continue; }
      for (const [k, v] of Object.entries(data)) {
        const p = v?.success && v.data && !Array.isArray(v.data) ? v.data.price_overview : null;
        if (p) { prices.get(Number(k))[cc] = [p.currency, p.initial, p.final, p.discount_percent]; got++; }
      }
      await sleep(DELAY_MS);
    }
    console.log(`${cc}: ${got} prezzi`);
  }

  // Batch falliti: mantieni il valore precedente invece di "cancellare" la regione
  for (const [cc, a] of failed) {
    const prev = latest.get(a)?.prices?.[cc];
    if (prev) prices.get(a)[cc] = prev;
  }

  const fetchedAt = new Date().toISOString();
  const snapRows = [], latestRows = [], seenRows = [];
  for (const [appid, p] of prices) {
    if (!Object.keys(p).length) continue; // gratis, rimosso o non disponibile ovunque
    const json = stable(p);
    const h = hash(json);
    seenRows.push([appid, fetchedAt]);
    if (latest.get(appid)?.hash === h) continue;
    snapRows.push([appid, day, json, "steam", fetchedAt]);
    latestRows.push([appid, json, h, fetchedAt]);
  }

  const stats = { games: appids.length, calls, changed: snapRows.length, failedBatches: failed.length / BATCH, day };
  console.log(stats);
  if (DRY) return;

  await insertMany("price_snapshot", ["appid", "day", "prices_json", "source", "fetched_at"], snapRows);
  await insertMany("price_latest", ["appid", "prices_json", "hash", "updated_at"], latestRows);
  for (let i = 0; i < seenRows.length; i += 90) {
    const part = seenRows.slice(i, i + 90);
    await query(`UPDATE tracked_game SET last_seen = ? WHERE appid IN (${part.map(() => "?").join(",")})`,
      [fetchedAt, ...part.map((r) => r[0])]);
  }
  await query("UPDATE run_log SET finished_at = ?, stats_json = ?, ok = ? WHERE id = ?",
    [new Date().toISOString(), JSON.stringify(stats), failed.length ? 0 : 1, runId]);
}

main().catch((e) => { console.error(e); process.exit(1); });
