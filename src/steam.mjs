// Client Steam condiviso: User-Agent, retry con backoff, ritmo costante tra le chiamate.
import { sleep } from "./d1.mjs";

export const UA = { "User-Agent": "steam-price-collector/1.0 (+https://github.com/UniRedz/steam-price-collector)" };

// Ritmo separato per host: store.steampowered.com ha limiti piu' stretti di api.steampowered.com
const DELAY = {
  "store.steampowered.com": Number(process.env.STEAM_DELAY_MS || 1600),
  "api.steampowered.com": Number(process.env.STEAM_API_DELAY_MS || 120),
};
const lastCall = {};

export async function steamJson(url, { retries = 5 } = {}) {
  const host = new URL(url).host;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const wait = (lastCall[host] || 0) + (DELAY[host] ?? 1000) - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall[host] = Date.now();
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (r.status === 403 || r.status === 404) return null; // app inesistente o non accessibile
      const text = await r.text();
      if (!text || text === "null") return null;
      return JSON.parse(text);
    } catch (e) {
      if (attempt === retries) { console.warn(`  rinuncio: ${url.slice(0, 120)} (${e.message})`); return null; }
      const backoff = 20_000 * attempt;
      console.warn(`  ${host}: ${e.message}, retry tra ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
  return null;
}

// Giochi attivi, wishlist prima (sono quelli che gli utenti guardano)
export async function activeGames(query, extraWhere = "") {
  return query(
    `SELECT appid, itad_id, origin FROM tracked_game WHERE active = 1 ${extraWhere}
     ORDER BY (origin = 'wishlist') DESC, appid`);
}

export const today = () => new Date().toISOString().slice(0, 10);
