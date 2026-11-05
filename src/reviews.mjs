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
// Recensioni dall'API pubblica di Steam. Il vecchio store.steampowered.com/appreviews e' deprecato (al suo posto
// IUserReviewsService/GetAppReviews, stessi filtri e stessi campi) e dal 23 ottobre 2026 rimanda alla home dello store.
const REVIEWS_API = "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/";
const PURCHASE_ALL = 1, NEGATIVE = 2, BY_HELPFUL = 0, BY_RECENT = 1; // enum dell'API
const appReviews = (input) => steamJson(`${REVIEWS_API}?input_json=${encodeURIComponent(JSON.stringify(input))}`, { pace: "reviews" });
// Le prime chiamate falliscono tutte: Steam ha cambiato qualcosa. Meglio fermarsi con un errore che girare a vuoto fino al
// limite di tempo del job (dal 23 ottobre 2026 ogni run veniva annullata cosi', senza scrivere una riga). Con i tentativi
// e le attese di steamJson, dieci giochi falliti costano al massimo una mezz'ora.
const FAIL_FAST_AFTER = 10;

// Totali di tutte le lingue e di tutti gli acquisti. withOffTopic: conta anche le recensioni fuori tema (review bomb)
// che Steam esclude dal punteggio. Una recensione per pagina: i totali arrivano con la prima.
async function summary(appid, withOffTopic = false) {
  const input = { appid, languages: ["all"], purchase_type: PURCHASE_ALL, num_per_page: 1 };
  if (withOffTopic) input.filter_offtopic_activity = false;
  return (await appReviews(input))?.response?.query_summary ?? null;
}

// Istogramma: ultimi 30 giorni giorno per giorno + periodi fuori tema (review bomb) esclusi da Steam + giorno della prima
// recensione (start_date)
async function histogram(appid) {
  const d = await steamJson(`${STORE}/appreviewhistogram/${appid}?l=english&review_score_preference=0`);
  const rec = d?.results?.recent;
  const iso = (t) => new Date(t * 1000).toISOString();
  return {
    recent: Array.isArray(rec) ? rec.map((x) => [iso(x.date).slice(0, 10), x.recommendations_up, x.recommendations_down]) : [],
    offtopic: (d?.past_events || []).filter((e) => e.type === 0).map((e) => [iso(e.start_date), iso(e.end_date)]),
    first: Number.isFinite(d?.results?.start_date) ? iso(d.results.start_date).slice(0, 10) : null,
  };
}

async function negatives(appid) {
  const base = { appid, languages: ["english"], review_type: NEGATIVE, purchase_type: PURCHASE_ALL };
  const recent = await appReviews({ ...base, filter: BY_RECENT, num_per_page: 100 });
  const texts = (recent?.response?.reviews || []).map((r) => r.review || "");
  if (texts.length < 20) return null; // campione troppo piccolo per dire qualcosa
  const helpful = await appReviews({ ...base, filter: BY_HELPFUL, num_per_page: 5, day_range: 180 });
  const top = (helpful?.response?.reviews || []).sort((a, b) => b.votes_up - a.votes_up)[0];
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

  // La colonna first_review_at arriva dalla migrazione 0006 (la applica il job prices, che gira in parallelo): finche' non
  // c'e' non la si scrive, cosi' l'ordine dei job non conta
  const hasFirst = (await query("SELECT name FROM pragma_table_info('review_stats')")).some((c) => c.name === "first_review_at");
  const stats = [], negRows = [];
  let ok = 0, flagged = 0, i = 0;
  const flush = async () => {
    if (stats.length) {
      const cols = ["appid", "total", "positive", "score_desc", "recent_json", "offtopic_events_json", "updated_at", ...(hasFirst ? ["first_review_at"] : [])];
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

  let answered = 0; // risposte valide di Steam, anche "nessuna recensione"
  for (const { appid } of games) {
    i++;
    const s = await summary(appid);
    if (s) answered++;
    else if (!answered && i >= FAIL_FAST_AFTER) throw new Error(`Nessuna risposta da GetAppReviews per i primi ${i} giochi: endpoint o parametri cambiati?`);
    if (!s || !s.total_reviews) continue;
    const now = new Date().toISOString();
    const h = await histogram(appid);
    const row = {
      appid, total: s.total_reviews, positive: s.total_positive, score_desc: s.review_score_desc,
      recent_json: JSON.stringify(h.recent), offtopic_events_json: JSON.stringify(h.offtopic), updated_at: now, total_incl_offtopic: null,
      first_review_at: h.first,
    };
    if (WEEKLY) {
      const all = await summary(appid, true);
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
