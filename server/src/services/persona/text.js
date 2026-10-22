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

const EMOJI_CHAR = /\p{Extended_Pictographic}\uFE0F?/gu;
/** Plan 32 KP1: drop emoji that aren't the user's own (the model copies them from examples or their message). */
export function ownEmojiOnly(text, allowed) {
  return String(text).replace(EMOJI_CHAR, (e) => (allowed.has(e.replace(/\uFE0F/g, '')) ? e : ''))
    .replace(/\s+([.!?,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Plan 32 KP1: the plan asked for 2 bubbles but the draft is one message → split it between sentences (the first half
 * of them, then the rest). A piece with no words (a trailing emoji) stays with the sentence before it.
 */
export function splitBurst(messages, burst = 1) {
  if (burst < 2 || messages.length !== 1) return messages;
  const pieces = [];
  for (const p of String(messages[0]).match(/[^.!?…]+[.!?…]*\s*/g) ?? []) {
    if (/[\p{L}\p{N}]/u.test(p) || !pieces.length) pieces.push(p);
    else pieces[pieces.length - 1] += p;
  }
  if (pieces.length < 2) return messages;
  const k = Math.floor(pieces.length / 2);
  return [pieces.slice(0, k).join('').trim(), pieces.slice(k).join('').trim()].filter(Boolean);
}
