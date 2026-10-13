// Un paese rappresentativo per ogni regione di prezzo Steam.
// ar = LATAM USD, tr = MENA USD, pk = South Asia USD, az = CIS USD, it = area euro.
export const REGIONS = [
  "us", "gb", "it", "br", "mx", "ca", "au", "nz", "jp", "kr", "cn", "in", "id", "my", "ph", "sg",
  "th", "vn", "hk", "tw", "ua", "kz", "pl", "no", "ch", "il", "za", "sa", "ae", "kw", "qa", "cl",
  "co", "pe", "cr", "uy", "ar", "tr", "pk", "ru", "az",
];

// Da quando lo storico ITAD di una regione e' fatto di prezzi Steam veri. ITAD segue alcune regioni da prima che Steam
// vendesse nella loro valuta, e per quel periodo riporta prezzi in dollari convertiti: importi che nessuno ha mai
// pagato. Quelli non entrano nel database (regola del progetto: mai conversioni di valuta).
// Controllato il 13 ottobre 2026 sui minimi storici gia' salvati (external_low): in Australia fino al 21 novembre 2018
// i prezzi pieni sono numeri come 20,16 o 13,48 AUD (dollari USA convertiti), dal 21 novembre sono prezzi veri
// (34,95, 14,50). Il taglio e' al 22: il giorno del cambio resta fuori, perche' non sappiamo a che ora e' avvenuto.
// Nelle altre regioni i dati ITAD iniziano quando Steam vendeva gia' nella valuta locale.
// null = nessun periodo convertito trovato. Una regione che non sta in questa tabella non si scarica: quando ITAD ne
// verifica una nuova va prima controllata e poi aggiunta qui.
export const HISTORY_SINCE = {
  us: null, it: null, gb: null, br: null, ca: null, cn: null, in: null, tw: null, nz: null, ph: null, pl: null,
  au: "2018-11-22T00:00:00Z",
};

// Gli eventi [quando, prezzo pieno, prezzo, sconto] da tenere per una regione: quelli dal giorno in cui i prezzi sono
// veri. Regione fuori dalla tabella: nessuno.
export function realEvents(region, events) {
  const since = HISTORY_SINCE[region];
  if (since === undefined) return [];
  if (since === null) return events;
  const from = Date.parse(since);
  return events.filter((e) => Date.parse(e[0]) >= from);
}
