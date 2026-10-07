// Applica le migration SQL in ordine. Idempotente (CREATE ... IF NOT EXISTS + tabella _migrations).
import { readdirSync, readFileSync } from "node:fs";
import { assertEnv, query } from "./d1.mjs";

assertEnv();
await query("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
const done = new Set((await query("SELECT name FROM _migrations")).map((r) => r.name));
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) { console.log(`= ${f}`); continue; }
  const stmts = readFileSync(`migrations/${f}`, "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await query(s);
  await query("INSERT INTO _migrations VALUES (?, ?)", [f, new Date().toISOString()]);
  console.log(`+ ${f} (${stmts.length} statement)`);
}
