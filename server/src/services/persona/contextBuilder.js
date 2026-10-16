// What the reply prompt sees about ME (plan 08 §1.2, ref Phase 6.1): sampled sayable facts, untold stories,
// non-verbatim private guidance, trait rules and my own real messages as few-shot exemplars. Pure functions over a
// loaded persona (cache.js), so the same rng gives the same context.
import { KG } from '../kg/config.js';
import { cosine } from '../kg/similarity.js';
import { traitRules } from './traitRules.js';

const QUESTION = /\?|\b(what|how|why|when|where|which|who|do you|are you|have you|kya|kaise|kab|kyun|kyu|shu|kem|kyare)\b/i;
export const isQuestion = (text) => QUESTION.test(String(text ?? ''));
const recency = (f) => 0.5 ** ((Date.now() - new Date(f.lastConfirmed ?? f.firstSeen ?? Date.now())) / (KG.DECAY_HALF_LIFE_DAYS * 86_400_000));
const weight = (f) => Math.max(f.importance ?? 0, f.strength ?? 0, 0.3);

/**
 * k facts sampled (softmax over relevance/importance/recency, seeded) from what I may say: public always; if_asked
 * only when they asked about that topic; private never. Stories are offered separately (storyCandidates).
 */
export function selectFacts(persona, { incomingVec, incomingText = '', rng, k = KG.SELECT_K } = {}) {
  const asked = isQuestion(incomingText);
  const rel = (f) => (incomingVec && f.vector ? Math.max(0, cosine(incomingVec, f.vector)) : 0);
  const pool = persona.facts.filter((f) => f.predicate !== 'story' && (f.disclosure === 'public' || (f.disclosure === 'if_asked' && asked && rel(f) >= KG.T_ASKED)))
    .map((f) => ({ f, score: 0.5 * rel(f) + 0.3 * weight(f) + 0.2 * recency(f) }));
  const out = [], seenConcepts = new Set();
  // The 3 facts most relevant to their message are always offered: this embedding model's scores sit close together,
  // so softmax sampling alone was near-uniform and once left out the very fact they asked about (first v2 run: his
  // sketching, when she mentioned his sketching) — the agent then denied it.
  if (incomingVec) {
    for (const p of [...pool].sort((a, b) => rel(b.f) - rel(a.f)).slice(0, Math.min(3, k))) {
      pool.splice(pool.indexOf(p), 1);
      out.push(p.f);
      if (p.f.conceptId) seenConcepts.add(String(p.f.conceptId));
    }
  }
  while (out.length < k && pool.length) {
    const ws = pool.map((p) => Math.exp(p.score / KG.TOPIC_TEMP));
    let r = rng() * ws.reduce((a, b) => a + b, 0), i = 0;
    while (i < ws.length - 1 && (r -= ws[i]) > 0) i++;
    const [{ f }] = pool.splice(i, 1);
    const c = f.conceptId && String(f.conceptId);
    if (c && seenConcepts.has(c)) continue;
    if (c) seenConcepts.add(c);
    out.push(f);
  }
  return out;
}

/** Up to 2 public stories not told yet in this conversation. */
export const storyCandidates = (persona, toldIds = []) => persona.facts.filter((f) => f.predicate === 'story' && f.disclosure === 'public' && !toldIds.includes(String(f._id))).slice(0, 2);

const TOPIC_NAMES = { health: 'health', family_conflict: 'family conflicts', past_relationships: 'past relationships', money: 'money', religion: 'religion', politics: 'politics', sexuality: 'sexuality' };
const PREDICATE_GUIDANCE = { goal: 'long-term plans beyond what is listed', background: 'personal history beyond what is listed', values: 'personal beliefs beyond what is listed', lifestyle: 'habits beyond what is listed' };

/** Private facts → behaviour rules that never contain their text. */
export function privateGuidance(persona) {
  const topics = new Set();
  for (const f of persona.privateFacts) {
    const t = (f.sensitivity?.sensitive && TOPIC_NAMES[f.sensitivity.topic]) || PREDICATE_GUIDANCE[f.predicate];
    if (t) topics.add(t);
  }
  return [...topics].map((t) => `Don't bring up ${t}; if asked, deflect lightly and change the subject.`);
}

/** Trait rules (tone only). */
export const toneRules = (persona) => traitRules(persona.traits);

/** k of my own messages most like the incoming one, diverse by mood/language (MMR). → [{ incoming, text }] */
export function selectExemplars(persona, { incomingVec, rng, k = KG.EXEMPLARS_K } = {}) {
  const pool = persona.samples.map((s) => ({ s, rel: incomingVec && s.vector ? cosine(incomingVec, s.vector) : rng() * 0.1 }));
  const out = [];
  while (out.length < k && pool.length) {
    let best = 0, bestScore = -Infinity;
    pool.forEach((p, i) => {
      const same = out.filter((o) => o.mood === p.s.mood || (o.lang?.languages ?? []).join() === (p.s.lang?.languages ?? []).join()).length;
      const score = 0.7 * p.rel - 0.3 * (same / (out.length || 1));
      if (score > bestScore) { best = i; bestScore = score; }
    });
    out.push(pool.splice(best, 1)[0].s);
  }
  return out.map((s) => ({ incoming: s.incoming ?? '(they start a new message)', text: s.text }));
}
