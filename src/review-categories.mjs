// Classificatore a parole chiave per le recensioni negative (inglese). Zero IA, zero costi.
// Restituisce la quota di recensioni che cita ogni categoria. E' un'indicazione, non un'analisi precisa.
export const CATEGORIES = {
  bugs: /\b(bugs?|buggy|crash(es|ed|ing)?|glitch(es|y)?|broken|freez(e|es|ing)|soft-?lock|corrupt(ed)? saves?|game-?breaking)\b/,
  performance: /\b(fps|frame ?rate|stutter(s|ing)?|lag(s|gy|ging)?|optimi[sz](ed|ation)|performance|unplayable on)\b/,
  content: /\b(shallow|repetitive|boring|content|too short|grind(y|ing)?|empty|lacks? depth|no depth|unfinished|barebones)\b/,
  price: /\b(over-?priced|price|expensive|refund(ed)?|full price|not worth)\b/,
  monetization: /\b(micro-?transactions?|mtx|pay[ -]?to[ -]?win|p2w|battle ?pass|cash ?shop|season ?pass|lootbox(es)?|loot box(es)?)\b/,
  online: /\b(servers?|matchmaking|queue times?|disconnect(s|ed|ing)?|cheat(ers?|ing)|hackers?|anti-?cheat|always[ -]online|desync)\b/,
  developer: /\b(devs?|developers?|abandon(ed|ware)?|no updates?|roadmap|communication|ignor(e|es|ing) (the )?(community|feedback))\b/,
  story: /\b(story|writing|dialogues?|plot|narrative|characters?|protagonist|ending)\b/,
  ai_content: /\b(ai[- ]generated|ai slop|generative ai|ai art|ai voices?)\b/,
  interface: /\b(ui|interface|menus?|clunky|controls?|keybinds?|ux)\b/,
  launcher_drm: /\b(launcher|drm|denuvo|ea app|ubisoft connect|rockstar launcher|account (link|required)|login)\b/,
};

export function classify(texts) {
  const n = texts.length;
  const out = {};
  if (!n) return out;
  for (const [cat, re] of Object.entries(CATEGORIES)) {
    const hits = texts.reduce((acc, t) => acc + (re.test(t.toLowerCase()) ? 1 : 0), 0);
    if (hits) out[cat] = Math.round((hits / n) * 100) / 100;
  }
  return out;
}

// Estratto pulito: niente markup BBCode di Steam, spazi compressi, taglio a parola intera
export function excerpt(text, max = 280) {
  const clean = String(text || "").replace(/\[\/?[a-z0-9*]+(=[^\]]*)?\]/gi, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, clean.lastIndexOf(" ", max - 1) > 0 ? clean.lastIndexOf(" ", max - 1) : max) + "…";
}
