// Controlla che i secret siano validi senza stamparli
import { query } from "./d1.mjs";
const env = process.env, out = [];
for (const k of ["CF_ACCOUNT_ID", "CF_D1_DATABASE_ID", "CF_API_TOKEN", "ITAD_API_KEY"]) {
  const v = env[k] || "";
  out.push(`${k}: ${v ? `${v.length} caratteri` : "MANCANTE"}${v === k ? "  <-- contiene il proprio NOME, non il valore" : ""}`);
}
console.log(out.join("\n"));
let ok = true;
try { const r = await query("SELECT count(*) n FROM tracked_game"); console.log(`D1 ok: ${r[0].n} giochi tracciati`); }
catch (e) { ok = false; console.log(`D1 ERRORE: ${e.message.slice(0, 200)}`); }
const r = await fetch(`https://api.isthereanydeal.com/games/lookup/v1?key=${env.ITAD_API_KEY}&appid=413150`);
console.log(r.ok ? "ITAD ok" : `ITAD ERRORE: HTTP ${r.status}`);
if (!r.ok || !ok) process.exit(1);
