// VoiceProfile v2 metrics (plan 05 §5 step 9, plan 15 §3): distributions computed in code from the user's own samples,
// optionally recency-weighted. Samples: [{ text, incoming?, mood?, lang?: { languages, script, codeSwitch }, weight? }].
import { tagLanguageHeuristic, tokensOf } from './language.js';

const EMOJI = /\p{Extended_Pictographic}/gu;
const ABBREVS = new Set(['u', 'ur', 'rn', 'tbh', 'idk', 'btw', 'ngl', 'imo', 'omg', 'pls', 'plz', 'thx', 'k', 'kk', 'ty', 'np', 'lmk', 'wbu', 'hbu', 'gn', 'gm', 'ofc', 'bc']);
const STOP = new Set(['i', 'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'is', 'it', 'its', 'im', "i'm", 'my', 'me', 'you', 'your', 'so', 'that', 'this', 'with', 'be', 'are', 'was', 'do', 'just', 'not', 'no', 'yes', 'what', 'how', 'too', 'have', 'has', 'we', 'if', 'like', 'can', 'will']);
const LAUGHS = [['lmao', /\blmao+\b/i], ['lol', /\blo+l+\b/i], ['hehe', /\b(he){2,}h?\b/i], ['hahaha', /\b(ha){3,}h?\b/i], ['haha', /\b(ha){2}h?\b/i], ['other', /\b(rofl|xd|hihi)\b/i]];

const r2 = (x) => Math.round(x * 100) / 100;
const words = (text) => String(text).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)); // emoji-only tokens aren't words
const wmean = (xs) => { const w = xs.reduce((s, [, v]) => s + v, 0); return w ? xs.reduce((s, [x, v]) => s + x * v, 0) / w : 0; };
const shares = (counts) => { const t = Object.values(counts).reduce((s, n) => s + n, 0); return Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, t ? r2(n / t) : 0])); };

function ending(text) {
  const t = text.trim();
  if (/\.{2,}$|…$/.test(t)) return '..';
  if (/\p{Extended_Pictographic}️?$/u.test(t)) return 'emoji';
  const last = t.at(-1);
  return ['.', '!', '?'].includes(last) ? last : 'none';
}

function petPhrases(samples) {
  const seenIn = new Map();
  for (const s of samples) {
    const toks = tokensOf(s.text);
    const grams = new Set();
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= toks.length; i++) {
        const g = toks.slice(i, i + n);
        if (g.every((t) => STOP.has(t)) || STOP.has(g[0]) || STOP.has(g.at(-1))) continue;
        grams.add(g.join(' '));
      }
    }
    for (const g of grams) seenIn.set(g, (seenIn.get(g) ?? 0) + 1);
  }
  const frequent = [...seenIn].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([g]) => g);
  return frequent.filter((g, i) => !frequent.slice(0, i).some((h) => h.includes(g))).slice(0, 8); // drop sub-phrases of longer ones
}

/** → the VoiceProfile metric fields (no LLM). */
export function computeVoiceProfile(samples, { mirrorsPrior = 0.5, priorWeight = 2 } = {}) {
  const S = samples.filter((s) => s.text?.trim()).map((s) => ({ ...s, lang: s.lang ?? tagLanguageHeuristic(s.text), weight: s.weight ?? 1 }));
  const rate = (fn) => r2(wmean(S.map((s) => [fn(s) ? 1 : 0, s.weight])));
  const emojis = S.flatMap((s) => s.text.match(EMOJI) ?? []);
  const emojiCounts = emojis.reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map());
  const withEmoji = S.filter((s) => (s.text.match(EMOJI) ?? []).length);
  const endEmoji = withEmoji.filter((s) => ending(s.text) === 'emoji').length; // of messages with emoji: emoji last vs inline
  const laughCounts = Object.fromEntries(LAUGHS.map(([k]) => [k, 0]));
  for (const s of S) { const hit = LAUGHS.find(([, re]) => re.test(s.text)); if (hit) laughCounts[hit[0]]++; }
  const allTokens = S.flatMap((s) => tokensOf(s.text));
  const iTokens = S.flatMap((s) => String(s.text).match(/(?<![\p{L}'])[iI](?![\p{L}'])/gu) ?? []);
  const endings = Object.fromEntries(['none', '.', '!', '?', '..', 'emoji'].map((k) => [k, 0]));
  for (const s of S) endings[ending(s.text)]++;

  // Language mix: each sample spreads its weight over its languages (by token share when known).
  const mix = {};
  for (const s of S) for (const l of s.lang.languages) mix[l] = (mix[l] ?? 0) + s.weight * (s.lang.shares?.[l] ?? 1 / s.lang.languages.length);
  const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  for (const l of Object.keys(mix)) mix[l] = r2(mix[l] / total);
  const dominant = Object.entries(mix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'en';
  // Mirroring: of replies to messages NOT in my dominant language, how many answered in the incoming one?
  const foreign = S.filter((s) => s.incoming && !tagLanguageHeuristic(s.incoming).languages.includes(dominant));
  const mirrored = foreign.filter((s) => { const inc = tagLanguageHeuristic(s.incoming).languages; return s.lang.languages.every((l) => inc.includes(l)); }).length;

  const closing = S.find((s) => s.mood === 'closing');
  return {
    sampleCount: S.length,
    builtAt: new Date(),
    wordCounts: S.map((s) => words(s.text).length),
    burstiness: rate((s) => s.text.trim().includes('\n')),
    questionBackRate: rate((s) => s.text.includes('?')),
    emojiPerMessage: r2(wmean(S.map((s) => [(s.text.match(EMOJI) ?? []).length, s.weight]))),
    topEmojis: [...emojiCounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e),
    emojiPlacement: withEmoji.length ? { end: r2(endEmoji / withEmoji.length), inline: r2(1 - endEmoji / withEmoji.length) } : { end: 0, inline: 0 },
    laughForms: shares(laughCounts),
    laughRate: rate((s) => LAUGHS.some(([, re]) => re.test(s.text))),
    abbrevRate: allTokens.length ? r2(allTokens.filter((t) => ABBREVS.has(t)).length / allTokens.length) : 0,
    abbrevs: [...new Set(allTokens.filter((t) => ABBREVS.has(t)))],
    lowercaseStartRatio: rate((s) => /^\P{L}*\p{Ll}/u.test(s.text.trim())),
    lowercaseIRate: iTokens.length ? r2(iTokens.filter((t) => t === 'i').length / iTokens.length) : 0,
    doublePunctRate: rate((s) => /[!?]{2,}|\.{2,}/.test(s.text)),
    elongationRate: rate((s) => /(\p{L})\1{2,}/u.test(s.text)),
    endings: shares(endings),
    petPhrases: petPhrases(S),
    closingStyle: closing?.text.trim() ?? null,
    language: {
      mix,
      codeSwitchRate: rate((s) => s.lang.codeSwitch),
      switchTriggers: [...new Set(S.filter((s) => s.lang.codeSwitch && s.mood).map((s) => s.mood))],
      mirrorsLanguage: r2((mirrored + mirrorsPrior * priorWeight) / (foreign.length + priorWeight)),
    },
  };
}

/** Re-apply the user's corrections after any rebuild ("I never use emojis" must survive re-computation). */
export function applyCorrections(profile) {
  if ((profile.neverSay ?? []).includes('emoji')) Object.assign(profile, { emojiPerMessage: 0, topEmojis: [] });
  return profile;
}
