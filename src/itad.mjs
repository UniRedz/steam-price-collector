// Job settimanale ITAD:
// 1) mappa appid Steam -> id ITAD
// 2) verifica per ogni regione se ITAD riporta ESATTAMENTE i prezzi Steam reali
// 3) solo per le regioni verificate salva il minimo storico Steam (storeLow, shop 61)
import { assertEnv, query, insertMany } from "./d1.mjs";
import { itad, chunks, KEY } from "./itad-client.mjs";
import { REGIONS } from "./regions.mjs";

const TRUST_THRESHOLD = 0.98;
const TRUST_SAMPLE = 200;

async function mapIds() {
  const missing = (await query("SELECT appid FROM tracked_game WHERE active = 1 AND itad_id IS NULL")).map((r) => r.appid);
  let mapped = 0;
  for (const part of chunks(missing, 200)) {
    const res = await itad("/lookup/id/shop/61/v1", part.map((a) => `app/${a}`));
    for (const [k, id] of Object.entries(res || {})) {
      if (!id) continue;
      await query("UPDATE tracked_game SET itad_id = ? WHERE appid = ?", [id, Number(k.slice(4))]);
      mapped++;
    }
  }
  console.log(`ITAD id mappati: ${mapped}/${missing.length}`);
}

async function checkTrust(games, now) {
  const sample = games.slice(0, TRUST_SAMPLE);
  const latest = new Map();
  for (const part of chunks(sample.map((g) => g.appid), 90)) {
    const rows = await query(`SELECT appid, prices_json FROM price_latest WHERE appid IN (${part.map(() => "?").join(",")})`, part);
    rows.forEach((r) => latest.set(r.appid, JSON.parse(r.prices_json)));
  }
  const trusted = [];
  for (const cc of REGIONS) {
    const res = await itad(`/games/prices/v3?country=${cc.toUpperCase()}&shops=61`, sample.map((g) => g.itad_id));
    let checked = 0, matched = 0, currency = null;
    for (const item of res || []) {
      const g = sample.find((x) => x.itad_id === item.id);
      const steam = g && latest.get(g.appid)?.[cc];
      const deal = item.deals?.[0];
      if (!steam || !deal) continue;
      checked++;
      currency = steam[0];
      if (deal.price.currency === steam[0] && deal.price.amountInt === steam[2]) matched++;
    }
    const ok = checked >= 20 && matched / checked >= TRUST_THRESHOLD ? 1 : 0;
    await query("INSERT OR REPLACE INTO region_trust VALUES (?, 'itad', ?, ?, ?, ?)", [cc, checked, matched, ok, now]);
    console.log(`${cc}: ${matched}/${checked} ${ok ? "AFFIDABILE" : "scartata"}`);
    if (ok) trusted.push({ cc, currency });
  }
  return trusted;
}

async function storeLows(games, trusted, now) {
  for (const { cc, currency } of trusted) {
    const rows = [];
    for (const part of chunks(games, 200)) {
      const res = await itad(`/games/storelow/v2?country=${cc.toUpperCase()}&shops=61`, part.map((g) => g.itad_id));
      for (const item of res || []) {
        const low = item.lows?.find((l) => l.shop?.id === 61);
        const g = part.find((x) => x.itad_id === item.id);
        // Un minimo in una valuta diversa da quella attuale della regione non e' confrontabile
        if (low && g && low.price.currency === currency) rows.push([g.appid, cc, "itad", low.price.currency, low.price.amountInt, low.cut, low.timestamp, now]);
      }
    }
    await insertMany("external_low",
      ["appid", "region", "source", "currency", "low_int", "low_cut", "low_at", "fetched_at"], rows);
    console.log(`${cc}: ${rows.length} minimi storici salvati`);
  }
  // Regioni non (piu') affidabili: i loro minimi esterni non devono restare in giro
  const regs = trusted.map((t) => t.cc);
  const placeholders = regs.map(() => "?").join(",") || "''";
  await query(`DELETE FROM external_low WHERE source = 'itad' AND region NOT IN (${placeholders})`, regs);
}

// Abbonamenti (Game Pass, ecc.): disponibilita' in US, indicativa per le altre regioni
async function subscriptions(games, now) {
  const rows = [];
  for (const part of chunks(games, 200)) {
    const res = await itad("/games/subs/v1?country=US", part.map((g) => g.itad_id));
    for (const item of res || []) {
      const g = part.find((x) => x.itad_id === item.id);
      for (const s of item.subs || []) if (g) rows.push([g.appid, "US", s.name, s.leaving, now]);
    }
  }
  await query("DELETE FROM subscription WHERE country = 'US'");
  await insertMany("subscription", ["appid", "country", "name", "leaving", "fetched_at"], rows);
  console.log(`Abbonamenti: ${rows.length} righe`);
}

async function main() {
  assertEnv();
  if (!KEY) throw new Error("ITAD_API_KEY mancante");
  const now = new Date().toISOString();
  await mapIds();
  const games = await query("SELECT appid, itad_id FROM tracked_game WHERE active = 1 AND itad_id IS NOT NULL ORDER BY appid");
  const trusted = await checkTrust(games, now);
  await storeLows(games, trusted, now);
  await subscriptions(games, now);
  await query("INSERT INTO run_log (job, started_at, finished_at, stats_json, ok) VALUES ('itad', ?, ?, ?, 1)",
    [now, new Date().toISOString(), JSON.stringify({ games: games.length, trusted: trusted.map((t) => t.cc) })]);
}

main().catch((e) => { console.error(e); process.exit(1); });
