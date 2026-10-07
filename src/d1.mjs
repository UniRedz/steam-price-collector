// Client minimale per Cloudflare D1 via REST API (gira fuori da Workers, es. GitHub Actions)
const { CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_API_TOKEN } = process.env;

export function assertEnv() {
  const missing = ["CF_ACCOUNT_ID", "CF_D1_DATABASE_ID", "CF_API_TOKEN"].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Variabili mancanti: ${missing.join(", ")}`);
}

const BASE = process.env.CF_API_BASE || "https://api.cloudflare.com/client/v4"; // override solo per test locali
const url = () =>
  `${BASE}/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

export async function query(sql, params = []) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url(), {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.success) return body.result?.[0]?.results ?? [];
    const msg = JSON.stringify(body.errors || body).slice(0, 300);
    // Limite giornaliero D1 superato: inutile riprovare
    if (/exceeded|daily limit/i.test(msg) && r.status !== 429) throw new Error(`D1 limite: ${msg}`);
    if (r.status === 400) throw new Error(`D1 SQL ${msg}`); // errore nella query: inutile riprovare
    if (attempt === 4) throw new Error(`D1 errore ${r.status}: ${msg}`);
    await sleep(2000 * attempt);
  }
}

// D1 accetta max 100 parametri per statement: spezza gli insert multi-riga
export async function insertMany(table, columns, rows, conflict = "OR REPLACE") {
  const perRow = columns.length;
  const chunk = Math.max(1, Math.floor(100 / perRow));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const placeholders = part.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    await query(`INSERT ${conflict} INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`, part.flat());
  }
}

// Upsert multi-riga. `update` e' la clausola SET, es. "total = excluded.total, peak = MAX(peak, excluded.peak)"
export async function upsertMany(table, columns, rows, conflictCols, update) {
  const chunk = Math.max(1, Math.floor(100 / columns.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const placeholders = part.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    await query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}
       ON CONFLICT(${conflictCols.join(",")}) DO UPDATE SET ${update}`,
      part.flat());
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
