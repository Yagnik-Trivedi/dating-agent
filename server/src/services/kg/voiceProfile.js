// VoiceProfile v2 metrics (plan 05 §5 step 9, plan 15 §3): distributions computed in code from the user's own samples,
// optionally recency-weighted. Samples: [{ text, incoming?, mood?, lang?: { languages, script, codeSwitch }, weight?,
// device?: 'mobile' | 'desktop', source?, burst? }].
import { KG } from './config.js';
import { tagLanguageHeuristic, tokensOf } from './language.js';

const EMOJI = /\p{Extended_Pictographic}/gu;
// Plan 32 KP1: emoji that react (faces, hands, hearts, fire, sparkles…) fit any chat; a thing emoji (🍍 from the
// pineapple-pizza prompt) belongs to its sample's topic and counts only if the user used it in 2+ samples.
const REACTION_EMOJI = /[\u{1F600}-\u{1F64F}\u{1F910}-\u{1F92F}\u{1F970}-\u{1F97A}\u{1F9D0}\u{1FAE0}-\u{1FAE8}\u{2639}\u{263A}\u{2763}\u{2764}\u{1F493}-\u{1F49F}\u{1F90D}\u{1F90E}\u{1F9E1}\u{1F44A}-\u{1F450}\u{1F64C}\u{1F64F}\u{1F918}\u{1F919}\u{1F91D}\u{1F91E}\u{1F525}\u{2728}\u{1F389}\u{1F38A}\u{1F480}\u{1F4AF}\u{1F440}]/u;
/** Sad emoji: the agent uses one only when they're down or tired (an apology sample's 😞 in a happy chat read oddly). */
export const SAD_EMOJI = /[\u{1F61E}\u{1F614}\u{1F622}\u{1F62D}\u{1F97A}\u{1F615}\u{2639}\u{1F641}\u{1F629}\u{1F62B}\u{1F61F}\u{1F625}\u{1F613}\u{1F494}]/u;
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

/**
 * My own emoji the agent may use: never one copied from the message I was replying to (the 😄 in "your profile made me
 * smile 😄"), and a thing emoji only if it shows up in 2+ samples. Most used first.
 */
function usableEmojis(S) {
  const total = new Map(), inSamples = new Map();
  for (const s of S) {
    const echo = new Set(String(s.incoming ?? '').match(EMOJI) ?? []);
    const mine = (s.text.match(EMOJI) ?? []).filter((e) => !echo.has(e));
    for (const e of mine) total.set(e, (total.get(e) ?? 0) + 1);
    for (const e of new Set(mine)) inSamples.set(e, (inSamples.get(e) ?? 0) + 1);
  }
  return [...total].filter(([e]) => inSamples.get(e) >= 2 || REACTION_EMOJI.test(e)).sort((a, b) => b[1] - a[1]).map(([e]) => e);
}

/**
 * Bursts (plan 32 KP1): the chance a reply goes out as 2 messages. Not from line breaks (nobody presses Enter inside one
 * onboarding text box, so it was ~0 for everyone): from my own chats (a message that continued my previous one) and the
 * self-report, which counts as SELF_REPORT_WEIGHT replies.
 */
function burstRate(S, selfReport) {
  const chats = S.filter((s) => s.source === 'own_chat');
  const starts = chats.filter((s) => !s.burst).reduce((t, s) => t + s.weight, 0);
  const more = Math.min(starts, chats.filter((s) => s.burst).reduce((t, s) => t + s.weight, 0));
  const prior = KG.SELF_REPORT_PRIORS.bursts[selfReport?.bursts] ?? KG.BURST_PRIOR;
  return r2((more + prior * KG.SELF_REPORT_WEIGHT) / (starts + KG.SELF_REPORT_WEIGHT));
}

/** Weighted mean of [value, weight] pairs, pulled toward the self-report's prior when there is one. */
const blend = (pairs, prior) => {
  if (prior == null) return wmean(pairs);
  const w = pairs.reduce((s, [, v]) => s + v, 0);
  return (pairs.reduce((s, [x, v]) => s + x * v, 0) + prior * KG.SELF_REPORT_WEIGHT) / (w + KG.SELF_REPORT_WEIGHT);
};

/**
 * → the VoiceProfile metric fields (no LLM). selfReport: User.textingStyle (plan 32 KP1): it sets the prior for emoji,
 * length, bursts and lowercase; desktop samples count DESKTOP_STYLE_WEIGHT for emoji, length and bursts.
 */
export function computeVoiceProfile(samples, { mirrorsPrior = 0.5, priorWeight = 2, selfReport = null } = {}) {
  const S = samples.filter((s) => s.text?.trim()).map((s) => ({ ...s, lang: s.lang ?? tagLanguageHeuristic(s.text), weight: s.weight ?? 1 }));
  const P = KG.SELF_REPORT_PRIORS;
  const report = selfReport && Object.fromEntries(['emoji', 'bursts', 'length', 'caps', 'stickers'].filter((k) => selfReport[k]).map((k) => [k, selfReport[k]]));
  const styleWeight = (s) => s.weight * (s.device === 'desktop' ? KG.DESKTOP_STYLE_WEIGHT : 1);
  const rate = (fn) => r2(wmean(S.map((s) => [fn(s) ? 1 : 0, s.weight])));
  const usable = usableEmojis(S);
  const cheerful = usable.filter((e) => !SAD_EMOJI.test(e));
  const reportsEmoji = ['a_lot', 'some'].includes(report?.emoji);
  // Length: a desktop reply is pulled toward the length the user says they write on their phone.
  const typical = P.length[report?.length];
  const wordCounts = S.map((s) => {
    const n = words(s.text).length;
    return s.device === 'desktop' && typical ? Math.max(1, Math.round(KG.DESKTOP_STYLE_WEIGHT * n + (1 - KG.DESKTOP_STYLE_WEIGHT) * typical)) : n;
  });
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
    wordCounts,
    burstiness: burstRate(S, report),
    questionBackRate: rate((s) => s.text.includes('?')),
    emojiPerMessage: r2(blend(S.map((s) => [(s.text.match(EMOJI) ?? []).length, styleWeight(s)]), P.emoji[report?.emoji])),
    // Sad ones are kept apart: planAct uses them only when they're down or tired.
    topEmojis: (cheerful.length || !reportsEmoji ? cheerful : KG.DEFAULT_EMOJIS).slice(0, 5),
    sadEmojis: usable.filter((e) => SAD_EMOJI.test(e)).slice(0, 3),
    emojiPlacement: withEmoji.length ? { end: r2(endEmoji / withEmoji.length), inline: r2(1 - endEmoji / withEmoji.length) } : { end: 0, inline: 0 },
    laughForms: shares(laughCounts),
    laughRate: rate((s) => LAUGHS.some(([, re]) => re.test(s.text))),
    abbrevRate: allTokens.length ? r2(allTokens.filter((t) => ABBREVS.has(t)).length / allTokens.length) : 0,
    abbrevs: [...new Set(allTokens.filter((t) => ABBREVS.has(t)))],
    lowercaseStartRatio: r2(blend(S.map((s) => [/^\P{L}*\p{Ll}/u.test(s.text.trim()) ? 1 : 0, s.weight]), P.caps[report?.caps])),
    lowercaseIRate: iTokens.length ? r2(iTokens.filter((t) => t === 'i').length / iTokens.length) : 0,
    doublePunctRate: rate((s) => /[!?]{2,}|\.{2,}/.test(s.text)),
    elongationRate: rate((s) => /(\p{L})\1{2,}/u.test(s.text)),
    endings: shares(endings),
    petPhrases: petPhrases(S),
    closingStyle: closing?.text.trim() ?? null,
    selfReport: report && Object.keys(report).length ? report : null,
    devices: { mobile: S.filter((s) => s.device === 'mobile').length, desktop: S.filter((s) => s.device === 'desktop').length, unknown: S.filter((s) => !s.device).length },
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
  if ((profile.neverSay ?? []).includes('emoji')) Object.assign(profile, { emojiPerMessage: 0, topEmojis: [], sadEmojis: [] });
  return profile;
}
