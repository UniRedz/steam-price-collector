// Client ITAD condiviso: chiave, ritmo costante, gestione 429
import { sleep } from "./d1.mjs";

export const KEY = process.env.ITAD_API_KEY;
const API = "https://api.isthereanydeal.com";
const DELAY_MS = Number(process.env.ITAD_DELAY_MS || 3200); // 100 req / 5 min senza email verificata

export async function itad(path, body) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    let r;
    try {
      r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}key=${KEY}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", "User-Agent": "steam-price-collector/1.0" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(10_000 * attempt);
      continue;
    }
    await sleep(DELAY_MS);
    if (r.status === 429) {
      const wait = Number(r.headers.get("retry-after") || 60) * 1000;
      console.warn(`ITAD 429, attendo ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (r.ok) return r.json();
    if (attempt === 5) throw new Error(`ITAD ${r.status} su ${path}`);
  }
}

export const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

