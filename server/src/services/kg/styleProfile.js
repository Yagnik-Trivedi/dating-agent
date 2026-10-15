// Style profile from section E ("how would you reply?"): metrics in code + an LLM description.
import { z } from 'zod';
import { chatJSON } from '../llm/client.js';
import * as describeStyle from '../prompts/describeStyle.js';
import { QUESTIONS } from './questions.js';

const HINGLISH = new Set([
  'yaar', 'kya', 'hai', 'hain', 'nahi', 'nahin', 'acha', 'accha', 'achha', 'bhai', 'matlab', 'bas', 'arre', 'arey', 'haan', 'na',
  'kaise', 'kuch', 'bohot', 'bahut', 'thoda', 'chal', 'chalo', 'theek', 'thik', 'mast', 'sahi', 'abhi', 'kal', 'aaj', 'tum', 'mera', 'meri',
  'tera', 'teri', 'hum', 'koi', 'woh', 'yeh', 'ye', 'kab', 'kyun', 'kyu', 'bilkul', 'pakka', 'jaldi', 'bindaas', 'scene', 'ji',
]);
const EMOJI = /\p{Extended_Pictographic}/gu;
const LAUGH = /\b(ha(ha)+|he(he)+|lol+|lmao+|rofl)\b/i;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x) => Math.round(x * 100) / 100;

function endingOf(msg) {
  const t = msg.trim();
  if (/\p{Extended_Pictographic}️?$/u.test(t)) return 'emoji';
  if (t.endsWith('...') || t.endsWith('…')) return 'ellipsis';
  return { '.': 'period', '!': 'exclamation', '?': 'question' }[t.at(-1)] ?? 'none';
}

/** Deterministic style metrics over a list of the user's own messages. */
export function styleMetrics(replies) {
  const msgs = replies.map((r) => String(r ?? '').trim()).filter(Boolean);
  if (!msgs.length) return null;
  const words = msgs.map((m) => m.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))); // emoji-only tokens aren't words
  const tokens = words.flat().map((w) => w.toLowerCase().replace(/[^\p{L}]/gu, '')).filter(Boolean);
  const share = (pred) => round(msgs.filter(pred).length / msgs.length);
  const endings = msgs.map(endingOf).reduce((acc, e) => ({ ...acc, [e]: (acc[e] ?? 0) + 1 }), {});
  return {
    messages: msgs.length,
    avgWords: round(words.reduce((s, w) => s + w.length, 0) / msgs.length),
    medianWords: median(words.map((w) => w.length)),
    emojiPerMessage: round(msgs.reduce((s, m) => s + (m.match(EMOJI)?.length ?? 0), 0) / msgs.length),
    lowercaseStartRatio: share((m) => /^\p{Ll}/u.test(m)),
    exclamationRate: share((m) => m.includes('!')),
    questionRate: share((m) => m.includes('?')),
    laughRate: share((m) => LAUGH.test(m)),
    hinglishRatio: tokens.length ? round(tokens.filter((t) => HINGLISH.has(t)).length / tokens.length) : 0,
    typicalEnding: Object.entries(endings).sort((a, b) => b[1] - a[1])[0][0],
  };
}

const descriptionSchema = z.object({
  description: z.string().min(1).max(1200),
  doList: z.array(z.string().min(1).max(160)).max(10).default([]),
  dontList: z.array(z.string().min(1).max(160)).max(10).default([]),
});

/** → { metrics, description, doList, dontList } or null when there are no samples. */
export async function buildStyleProfile({ answersE = {}, userId }) {
  const samples = QUESTIONS.sections.find((s) => s.id === 'E').items
    .map((item) => ({ incoming: item.text, reply: String(answersE[item.id] ?? '').trim() }))
    .filter((s) => s.reply);
  const metrics = styleMetrics(samples.map((s) => s.reply));
  if (!metrics) return null;
  const described = await chatJSON({
    tier: 'mid',
    messages: describeStyle.build({ samples, metrics }),
    schema: descriptionSchema,
    purpose: 'describe-style',
    userId,
  });
  return { metrics, ...described };
}
