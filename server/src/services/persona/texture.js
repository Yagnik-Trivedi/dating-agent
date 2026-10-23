// Plan 33 C1 (A6): natural texture. The user's own fillers ("hmm", "idk", "tbh", "acha"…) at about their own rate, never
// one they don't use; weak or uncertain things said with a hedge; thinking out loud or an honest "idk" when answering.
// Pure code: the rates come from the user's own replies (VoiceProfile.fillers, or their samples for older profiles).
import { KG } from '../kg/config.js';
import { sentencesOf } from './text.js';

// Forms we look for: [form, detect, strip]. strip: how a form the user never uses is cut from a draft ($1 keeps the
// sentence break before a sentence-start word); null = ordinary language ("i think", "kinda"), only counted.
const anywhere = (src) => new RegExp(String.raw`\s*,?\s*\b(?:${src})\b[,.!…]*`, 'gi');
const atStart = (src) => new RegExp(String.raw`(^|[.!?]\s+)(?:${src})\b[,.!…]*\s*`, 'gi');
export const FILLERS = [
  ['hmm', /\b(?:h+m{2,}|hm)\b/i, anywhere('h+m{2,}|hm')],
  ['idk', /\bidk\b/i, anywhere('idk')],
  ['tbh', /\btbh\b/i, anywhere('tbh')],
  ['ngl', /\bngl\b/i, anywhere('ngl')],
  ['lowkey', /\blow-?key\b/i, anywhere('low-?key')],
  ['umm', /\bu+m{2,}\b/i, anywhere('u+m{2,}')],
  ['acha', /\bach+h?a+\b/i, anywhere('ach+h?a+')],
  ['arre', /\b(?:arr+e+y?|arey)\b/i, anywhere('arr+e+y?|arey')],
  ['yaar', /\bya+r\b/i, anywhere('ya+r')],
  ['wait', /(?:^|[.!?]\s+)wait\b(?=[\s,.!?]|$)/i, atStart('wait')],
  ['ok so', /(?:^|[.!?]\s+)ok(?:ay)? so\b/i, atStart('ok(?:ay)? so')],
  ['i think', /(?:^|[.!?,]\s*)i think\b/i, null],
  ['honestly', /(?:^|[.!?]\s+)honestly\b/i, null],
  ['kinda', /\b(?:kind ?of|kinda)\b/i, null],
];
const LAUGHS = [['lmao', 'lmao+'], ['lol', 'lo+l+'], ['hehe', '(?:he){2,}h?'], ['hahaha', '(?:ha){3,}h?'], ['haha', '(?:ha){2}h?']]
  .map(([form, src]) => [form, new RegExp(String.raw`\b${src}\b`, 'i'), anywhere(src)]);
// What a hedge sounds like (for the A9 metric "hedged statements on uncertain nodes").
export const HEDGE = /\b(i think|i guess|kinda|kind of|sort of|maybe|probably|not sure|idk|i don'?t know|depends|i feel like|somewhat|a bit|ish|torn|back and forth|i suppose)\b|\?$/i;

const r2 = (x) => Math.round(x * 100) / 100;

/** { form: share of my replies that use it } for the forms I use at all. samples: [{ text, weight? }] */
export function fillerRates(samples = []) {
  const S = samples.filter((s) => s.text?.trim());
  const total = S.reduce((t, s) => t + (s.weight ?? 1), 0);
  if (!total) return {};
  const out = {};
  for (const [form, re] of FILLERS) {
    const w = S.filter((s) => re.test(s.text)).reduce((t, s) => t + (s.weight ?? 1), 0);
    if (w) out[form] = r2(w / total);
  }
  return out;
}

/** How often my replies hedge (0..1). */
export const hedgeRate = (samples = []) => {
  const S = samples.filter((s) => s.text?.trim());
  return S.length ? r2(S.filter((s) => sentencesOf(s.text).some((x) => HEDGE.test(x.replace(/\?$/, '')))).length / S.length) : 0;
};

/** A fact to say with a hedge: a like or opinion held loosely, or one the user marked as unsure. */
export const isHedged = (f = {}) => Boolean(f.uncertain || (['likes', 'dislikes', 'opinion'].includes(f.predicate) && f.strength != null && f.strength < KG.HEDGE_STRENGTH));

function pickWeighted(dist, rng) {
  const entries = Object.entries(dist).filter(([, w]) => w > 0);
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries.at(-1)?.[0] ?? null;
}

/**
 * This message's texture (own seeded rng: the act plan's draws are unchanged). voice: VoiceProfile; samples: my voice
 * samples (older profiles have no `fillers`); answering: they asked me something; unknown: nothing listed on it;
 * loose: the facts on what they asked are all held loosely. → { filler, fillers (mine), move: 'think'|'not_sure'|null }
 */
export function planTexture({ voice = {}, samples = [], rng, answering = false, unknown = false, loose = false }) {
  const rates = voice.fillers ?? fillerRates(samples);
  const total = Math.min(KG.FILLER_MAX_RATE, Object.values(rates).reduce((a, b) => a + b, 0));
  const filler = rng() < total ? pickWeighted(rates, rng) : null;
  const hedges = voice.hedgeRate ?? hedgeRate(samples);
  let move = null;
  if (answering && unknown) move = 'not_sure';
  else if (answering && (loose || rng() < KG.THINK_RATE * hedges)) move = 'think';
  return { filler, fillers: Object.keys(rates), move };
}

/** Laugh forms I use (laughForms shares > 0). */
const myLaughs = (voice = {}) => Object.entries(voice.laughForms ?? {}).filter(([, v]) => v > 0).map(([k]) => k);

/** Filler and laugh forms in a text. → [form] */
export function fillersIn(text) {
  const t = String(text);
  return [...FILLERS.filter(([, re]) => re.test(t)).map(([f]) => f), ...LAUGHS.filter(([, re]) => re.test(t)).slice(0, 1).map(([f]) => f)];
}

/**
 * Remove fillers and laughs I never use ("lol" for someone who writes "haha"). → { text, stripped: [form] }
 * A laugh is kept when I laugh at all and use no form the model could swap in (no laughForms data yet).
 */
export function stripForeign(text, { fillers = [], voice = {} } = {}) {
  let t = String(text);
  const stripped = [];
  const cut = (strip) => { t = t.replace(strip, (m, lead) => (typeof lead === 'string' ? lead : ' ')); };
  for (const [form, re, strip] of FILLERS) if (strip && !fillers.includes(form) && re.test(t)) { cut(strip); stripped.push(form); }
  const laughs = myLaughs(voice);
  // Only once laugh data exists; "haha" and "hahaha" count as one laugh.
  if (voice.laughForms) for (const [form, re, strip] of LAUGHS) if (!laughs.includes(form) && !(/^ha/.test(form) && laughs.some((l) => /^ha/.test(l))) && re.test(t)) { cut(strip); stripped.push(form); }
  t = t.replace(/\s+([,.!?…])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,.!…]+/, '').trim();
  return { text: t, stripped };
}
