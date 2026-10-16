// Pure text helpers for agent drafts (moved from the v1 guard; all measured in plan 08 v1).

/** Strip reasoning leftovers, markdown, a "Name:" prefix and wrapping quotes. */
export function cleanText(text, firstName = '') {
  let s = String(text ?? '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/\*\*|__|`/g, '').trim();
  for (const prefix of ['You', firstName].filter(Boolean)) {
    if (s.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)) s = s.slice(prefix.length + 1).trim();
  }
  if (/^["“'].*["”']$/s.test(s)) s = s.slice(1, -1).trim();
  return s.replace(/\s+/g, ' ');
}

/** At most one question: keep everything up to the first "?" when another follows. */
export function oneQuestion(text) {
  const first = text.indexOf('?');
  if (first < 0 || text.indexOf('?', first + 1) < 0) return text;
  return text.slice(0, first + 1).trim();
}

export const words = (s) => String(s).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
export const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
export const sentencesOf = (text) => (String(text).match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));

/** A 5-word run shared with a recent message (either side) = echoing. → the echoed phrase, or null. */
export function echoOf(text, recentTexts = [], n = 5) {
  const grams = (w) => new Set(w.map((_, i) => w.slice(i, i + n).join(' ')).filter((g) => g.split(' ').length === n));
  const seen = new Set(recentTexts.flatMap((t) => [...grams(norm(t))]));
  return [...grams(norm(text))].find((g) => seen.has(g)) ?? null;
}
