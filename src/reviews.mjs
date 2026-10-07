// Recensioni Steam.
//   node src/reviews.mjs           -> giornaliero: totali (tutte le lingue) + ultimi 30 giorni dall'istogramma
//   node src/reviews.mjs --weekly  -> in piu': conteggio con review bomb fuori tema + motivi delle negative (<75%)
import { assertEnv, query, upsertMany } from "./d1.mjs";
import { steamJson, activeGames } from "./steam.mjs";
import { classify, excerpt } from "./review-categories.mjs";

const WEEKLY = process.argv.includes("--weekly");
const LIMIT = Number(process.env.LIMIT || 0);
const NEG_BELOW = 0.75;
const STORE = "https://store.steampowered.com";

async function summary(appid, extra = "") {
  const d = await steamJson(`${STORE}/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0${extra}`);
  return d?.success === 1 ? d.query_summary : null;
}

// Istogramma: ultimi 30 giorni giorno per giorno + periodi fuori tema (review bomb) esclusi da Steam
async function histogram(appid) {
  const d = await steamJson(`${STORE}/appreviewhistogram/${appid}?l=english&review_score_preference=0`);
  const rec = d?.results?.recent;
  const iso = (t) => new Date(t * 1000).toISOString();
  return {
    recent: Array.isArray(rec) ? rec.map((x) => [iso(x.date).slice(0, 10), x.recommendations_up, x.recommendations_down]) : [],
    offtopic: (d?.past_events || []).filter((e) => e.type === 0).map((e) => [iso(e.start_date), iso(e.end_date)]),
  };
}

async function negatives(appid) {
  const base = `${STORE}/appreviews/${appid}?json=1&language=english&review_type=negative&purchase_type=all`;
  const recent = await steamJson(`${base}&num_per_page=100&filter=recent`);
  const texts = (recent?.reviews || []).map((r) => r.review || "");
  if (texts.length < 20) return null; // campione troppo piccolo per dire qualcosa
  const helpful = await steamJson(`${base}&num_per_page=5&filter=all&day_range=180`);
  const top = (helpful?.reviews || []).sort((a, b) => b.votes_up - a.votes_up)[0];
  return {
    sample: texts.length,
    categories: classify(texts),
    top: top ? { text: excerpt(top.review), votes: top.votes_up, date: new Date(top.timestamp_created * 1000).toISOString().slice(0, 10) } : null,
  };
}

async function main() {
  assertEnv();
  const started = new Date().toISOString();
  let games = await activeGames(query);
  if (LIMIT) games = games.slice(0, LIMIT);
  console.log(`Recensioni ${WEEKLY ? "(settimanale)" : "(giornaliero)"}: ${games.length} giochi`);

  const stats = [], negRows = [];
  let ok = 0, flagged = 0, i = 0;
  const flush = async () => {
    if (stats.length) {
      const cols = ["appid", "total", "positive", "score_desc", "recent_json", "offtopic_events_json", "updated_at"];
      const rows = stats.map((s) => cols.map((c) => s[c]));
      await upsertMany("review_stats", cols, rows, ["appid"],
        cols.slice(1).map((c) => `${c} = excluded.${c}`).join(", "));
      const off = stats.filter((s) => s.total_incl_offtopic != null);
      for (const s of off) await query("UPDATE review_stats SET total_incl_offtopic = ? WHERE appid = ?", [s.total_incl_offtopic, s.appid]);
      stats.length = 0;
    }
    if (negRows.length) {
      const cols = ["appid", "sample", "language", "categories_json", "top_excerpt", "top_votes", "top_date", "updated_at"];
      await upsertMany("review_negatives", cols, negRows.splice(0), ["appid"],
        cols.slice(1).map((c) => `${c} = excluded.${c}`).join(", "));
    }
  };

  for (const { appid } of games) {
    i++;
    const s = await summary(appid);
    if (!s || !s.total_reviews) continue;
    const now = new Date().toISOString();
    const h = await histogram(appid);
    const row = {
      appid, total: s.total_reviews, positive: s.total_positive, score_desc: s.review_score_desc,
      recent_json: JSON.stringify(h.recent), offtopic_events_json: JSON.stringify(h.offtopic), updated_at: now, total_incl_offtopic: null,
    };
    if (WEEKLY) {
      const all = await summary(appid, "&filter_offtopic_activity=0");
      row.total_incl_offtopic = all?.total_reviews ?? null;
      if (row.total_incl_offtopic - row.total >= 50) flagged++;
      if (s.total_positive / s.total_reviews < NEG_BELOW) {
        const n = await negatives(appid);
        if (n) negRows.push([appid, n.sample, "english", JSON.stringify(n.categories), n.top?.text ?? null, n.top?.votes ?? null, n.top?.date ?? null, now]);
      }
    }
    stats.push(row);
    ok++;
    if (stats.length >= 50) await flush();
    if (i % 100 === 0) console.log(`  ${i}/${games.length}`);
  }
  await flush();
  const result = { games: games.length, ok, weekly: WEEKLY, offTopicFlagged: flagged };
  console.log(result);
  await query("INSERT INTO run_log (job, started_at, finished_at, stats_json, ok) VALUES (?, ?, ?, ?, 1)",
    [WEEKLY ? "reviews-weekly" : "reviews", started, new Date().toISOString(), JSON.stringify(result)]);
}

main().catch((e) => { console.error(e); process.exit(1); });
