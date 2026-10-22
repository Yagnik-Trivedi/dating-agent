// The user's own graph for the review screen (plan 05 §6, plan 15 §5): center → 8 hubs → facts, plus "How I text"
// nodes generated from the VoiceProfile. Traits are never shown; no embedding bytes leave the server.
import { Concept } from '../../models/Concept.js';
import { KgFact } from '../../models/KgFact.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { KG } from './config.js';
import { TEXTING_STYLE } from './textingStyle.js';

export const HUBS = [
  { key: 'who', label: 'Who I am' }, { key: 'likes', label: 'Likes' }, { key: 'dislikes', label: 'Dislikes' },
  { key: 'values', label: 'Values & lifestyle' }, { key: 'goals', label: 'Goals' }, { key: 'stories', label: 'Stories' },
  { key: 'opinions', label: 'Opinions & humour' }, { key: 'voice', label: 'How I text' },
];
const LANG = { en: 'English', hi: 'Hindi', hi_latn: 'Hindi', gu: 'Gujarati', gu_latn: 'Gujarati', mr: 'Marathi', mr_latn: 'Marathi', ta: 'Tamil', ta_latn: 'Tamil', te: 'Telugu', bn: 'Bengali', pa: 'Punjabi', kn: 'Kannada', ml: 'Malayalam' };

export function hubOf(f) {
  if (f.predicate === 'likes') return f.polarity === -1 ? 'dislikes' : 'likes';
  return { background: 'who', reflection: 'who', dislikes: 'dislikes', values: 'values', lifestyle: 'values', goal: 'goals', story: 'stories', opinion: 'opinions', humor: 'opinions' }[f.predicate] ?? null;
}

/** Confidence decays at read time from lastConfirmed (DECAY_HALF_LIFE_DAYS). */
export const decayed = (f, now = Date.now()) => f.confidence * 0.5 ** ((now - new Date(f.lastConfirmed ?? now)) / (KG.DECAY_HALF_LIFE_DAYS * 86_400_000));

/** Readable, correctable statements about how the user texts. Each has a stable id + the field a correction changes. */
export function voiceNodes(v) {
  if (!v?.sampleCount) return [];
  const out = [];
  const add = (key, label) => out.push({ id: `voice:${key}`, field: key, label });
  const mix = Object.entries(v.language?.mix ?? {}).filter(([l, s]) => l !== 'en' && s >= 0.1).sort((a, b) => b[1] - a[1]);
  if (mix.length) add('language', `Mixes ${mix.map(([l]) => LANG[l] ?? l).join(' & ')} & English (≈${Math.round(mix[0][1] * 100)}%)`);
  if (v.emojiPerMessage >= 0.15 && v.topEmojis?.length) add('emoji', `Top emojis ${v.topEmojis.slice(0, 3).join('')}`);
  else add('emoji', 'Rarely uses emoji');
  const laugh = Object.entries(v.laughForms ?? {}).sort((a, b) => b[1] - a[1])[0];
  if (v.laughRate >= 0.1 && laugh?.[1]) add('laugh', `Laughs: ${laugh[0]}`);
  const words = [...(v.wordCounts ?? [])].sort((a, b) => a - b);
  const median = words[Math.floor(words.length / 2)] ?? 0;
  add('length', `${median < 10 ? 'Short' : median < 20 ? 'Medium-length' : 'Long'} replies (~${median} words)`);
  if (v.lowercaseStartRatio >= 0.7) add('lowercase', 'Starts messages in lowercase');
  if (v.burstiness >= 0.3) add('bursts', 'Often sends a few short messages in a row'); // plan 32 KP1
  if (v.petPhrases?.[0]) add('phrase', `Says '${v.petPhrases[0]}' a lot`);
  if (v.closingStyle) add('closing', `Ends chats with '${v.closingStyle.slice(0, 40)}'`);
  return out;
}

export async function userGraph(user) {
  const [facts, voice] = await Promise.all([
    KgFact.find({ subjectId: user._id, observerId: null, predicate: { $nin: ['trait', 'style'] } }).select('-embedding').lean(),
    VoiceProfile.findOne({ userId: user._id }).lean(),
  ]);
  const concepts = new Map((await Concept.find({ _id: { $in: facts.map((f) => f.conceptId).filter(Boolean) } }, { label: 1 }).lean()).map((c) => [String(c._id), c.label]));
  const nodes = [{ id: 'me', label: user.name, type: 'self', group: 'self', size: 1, center: true }];
  const links = [];
  const used = new Set();
  for (const f of facts) {
    const hub = hubOf(f);
    if (!hub) continue;
    used.add(hub);
    const confidence = Math.round(decayed(f) * 100) / 100;
    nodes.push({
      id: String(f._id), label: f.userEdited || !f.conceptId ? f.object : (concepts.get(String(f.conceptId)) ?? f.object),
      object: f.object, type: f.predicate, group: hub, hub, size: Math.max(f.importance ?? 0, f.strength ?? 0) || 0.5, weight: Math.max(f.importance ?? 0, f.strength ?? 0) || 0.5,
      confidence, disclosure: f.disclosure, source: f.source, polarity: f.polarity, strength: f.strength, userEdited: f.userEdited, isDealbreaker: f.isDealbreaker,
      quote: f.evidence?.[0]?.quote ?? null, learnedAt: f.evidence?.[0]?.at ?? f.createdAt ?? null, // "This is you": where it came from (plan 30 S6)
    });
    links.push({ source: `hub:${hub}`, target: String(f._id), label: f.predicate });
  }
  for (const n of voiceNodes(voice)) {
    used.add('voice');
    nodes.push({ ...n, type: 'voice', group: 'voice', hub: 'voice', size: 0.6, weight: 0.6, confidence: Math.min(0.9, (voice.sampleCount ?? 0) / 30) });
    links.push({ source: 'hub:voice', target: n.id, label: 'style' });
  }
  for (const h of HUBS.filter((x) => used.has(x.key))) {
    nodes.push({ id: `hub:${h.key}`, label: h.label, type: 'hub', group: h.key, hubNode: true, size: 0.9, weight: 0.9 });
    links.push({ source: 'me', target: `hub:${h.key}`, label: 'hub' });
  }
  // Plan 32 KP1: "How I text" chips — the self-report the user can correct right here.
  const { at, ...style } = (user.toObject ? user.toObject() : user).textingStyle ?? {};
  return { nodes, links, voice: voiceStats(voice), textingStyle: { questions: TEXTING_STYLE, value: style } };
}

/** Plain numbers for the "How I text" bars (my own voice; plan 30 S6). 0–1 positions on each bar's scale. */
export function voiceStats(v) {
  if (!v?.sampleCount) return null;
  const words = [...(v.wordCounts ?? [])].sort((a, b) => a - b);
  const median = words[Math.floor(words.length / 2)] ?? 0;
  const nonEn = Object.entries(v.language?.mix ?? {}).filter(([l]) => l !== 'en').reduce((s, [, x]) => s + x, 0);
  const laugh = Object.entries(v.laughForms ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    medianWords: median, emojiPerMessage: v.emojiPerMessage ?? 0, nonEnglishShare: Math.round(nonEn * 100) / 100, laughRate: v.laughRate ?? 0, laugh, samples: v.sampleCount,
    burstiness: v.burstiness ?? 0, devices: v.devices ?? null, // plan 32 KP1
  };
}
