// Plan 33 Q1 (A3, B2 "The brain map"): one module's answers → facts on their branches, the links between them, voice
// samples and the free-text answers that also go to the model. Pure code (no DB, no LLM), so it's unit-tested directly.
//
// Every answer becomes at least one fact in the user's own words (an answer is never lost to a failed model call):
// - tap / pick → one fact per chosen option ("chai or coffee: coffee"); "can't decide" style options → uncertain
// - line → "topic: their answer"; a long one (> LONG_WORDS) is also read by the model for finer facts (SUPPORTS)
// - story → a story fact (the agent's anecdote) + the model's facts (SUPPORTS)
// - reply → a voice sample (how they text), no fact
// - why → like → what it gives → why that matters (WHY edges)
// Follow-ups: a "how strongly?" sets the parent's strength; a "why" is a reason (WHY edge); anything else is a child
// fact on the parent's branch (BRANCH_OF, child → parent).
import { KG } from './config.js';
import { CORE_VALUES, moduleOf, QUESTION_BY_ID, QUESTIONS, STRENGTH_OF } from './questions.js';

export const LONG_WORDS = 12;
const OBJECT_MAX = 160;
// A free-text answer that is itself "I don't know".
const UNSURE_TEXT = /^\s*(idk|i don'?t know|no idea|not sure|can'?t decide|depends|hmm+|honestly no idea|never really thought)/i;
const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
const clip = (t, n = OBJECT_MAX) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const answerRef = (id, quote = null) => [{ quote, sourceRef: { kind: 'answer', id }, at: new Date() }];
const isSet = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim().length > 0);

/** The fields every module fact carries. */
function base(q, mod, now) {
  return {
    source: 'questionnaire_module', confidence: 1, polarity: 1, qid: q.id, module: mod.id, branch: q.branch,
    depthTier: q.tier ?? QUESTION_BY_ID.get(q.parent)?.tier ?? 'surface', disclosure: q.disclosure ?? QUESTION_BY_ID.get(q.parent)?.disclosure ?? 'public',
    ...((q.current ?? QUESTION_BY_ID.get(q.parent)?.current) && { isCurrent: true, currentUntil: new Date(now + KG.CURRENT_DAYS * 86_400_000) }),
  };
}

/** A chosen option (tap/pick) → fact. */
function optionFact(q, mod, now, option, slot) {
  const unsure = Boolean(option.unsure);
  return {
    ...base(q, mod, now), slot, predicate: q.as ?? 'likes', object: `${q.topic}: ${option.label.toLowerCase()}`, value: option.value, strength: 0.6,
    ...(unsure && { uncertain: true }),
    ...(q.concept && !unsure && { conceptText: option.label.toLowerCase(), conceptType: q.concept }),
    evidence: answerRef(`M.${q.id}`, option.label),
  };
}

/** A free-text answer (line / story / a follow-up) → its fact in the user's own words. */
function textFact(q, mod, now, text, slot, predicate = q.as ?? 'background') {
  const t = String(text).trim();
  const unsure = Boolean(q.unsure) || UNSURE_TEXT.test(t);
  const short = words(t) <= 4;
  return {
    ...base(q, mod, now), slot, predicate: q.type === 'story' ? 'story' : predicate, // a story is the agent's anecdote
    object: `${q.topic}: ${clip(t)}`, strength: 0.6,
    ...(unsure && { uncertain: true }),
    ...(q.concept && short && !unsure && { conceptText: t.toLowerCase().replace(/[.!?]+$/, ''), conceptType: q.concept }),
    evidence: answerRef(`M.${q.id}`, t),
  };
}

/**
 * → { facts, links: [{ type, from: slot, to: slot }], samples: [{ qid, incoming, text, mood }], extract: [{ qid, slot,
 * question, answer, branch, tier, disclosure, current }] } for one module. `answers`: that module's flat answers.
 */
export function moduleFacts(moduleId, answers = {}, { now = Date.now() } = {}) {
  const mod = moduleOf(moduleId);
  const out = { facts: [], links: [], samples: [], extract: [] };
  if (!mod) return out;
  for (const q of mod.questions) {
    const a = answers[q.id];
    if (!isSet(a)) continue;
    const slot = `M.${q.id}`;
    const anchors = []; // the slots follow-ups hang off
    if (q.type === 'reply') {
      out.samples.push({ qid: q.id, incoming: q.incoming, text: String(a).trim(), mood: q.mood ?? 'casual' });
      continue;
    }
    if (q.type === 'tap' || q.type === 'pick') {
      const chosen = (Array.isArray(a) ? a : [a]).map((v) => q.options.find((x) => x.value === v)).filter(Boolean);
      for (const option of chosen) {
        const s = q.multi ? `${slot}.${option.value}` : slot;
        out.facts.push(optionFact(q, mod, now, option, s));
        anchors.push(s);
      }
    } else if (q.type === 'why') {
      (Array.isArray(a) ? a : []).forEach((entry, i) => {
        const like = String(entry.like ?? '').trim();
        if (!like) return;
        const s = `${slot}.${i + 1}`;
        out.facts.push({ ...base(q, mod, now), slot: `${s}.like`, predicate: 'likes', object: like.toLowerCase(), strength: 0.9, depthTier: 'surface', branch: [...q.branch, like.toLowerCase()],
          conceptText: like.toLowerCase(), conceptType: 'activity', evidence: answerRef(`M.${q.id}`, like) });
        let prev = `${s}.like`;
        for (const [k, label] of [['gives', `${like.toLowerCase()} gives me`], ['why', 'that matters because']]) {
          const t = String(entry[k] ?? '').trim();
          if (!t) continue;
          out.facts.push({ ...base(q, mod, now), slot: `${s}.${k}`, predicate: 'values', object: `${label}: ${clip(t)}`, strength: 0.7, branch: [...q.branch, like.toLowerCase(), k],
            ...(UNSURE_TEXT.test(t) && { uncertain: true }), evidence: answerRef(`M.${q.id}`, t) });
          out.links.push({ type: 'WHY', from: prev, to: `${s}.${k}` });
          prev = `${s}.${k}`;
        }
      });
      continue;
    } else {
      out.facts.push(textFact(q, mod, now, a, slot));
      anchors.push(slot);
      if (q.type === 'story' || words(a) > LONG_WORDS) {
        out.extract.push({ qid: q.id, slot, question: q.text, answer: String(a).trim(), branch: q.branch, tier: q.tier, disclosure: q.disclosure, current: Boolean(q.current) });
      }
    }

    for (const s of q.subs) {
      const v = answers[s.id];
      if (!isSet(v) || !anchors.length) continue;
      const sub = { ...s, module: mod.id, parent: q.id, tier: q.tier, disclosure: q.disclosure, current: q.current };
      if (s.role === 'strength') {
        const strength = STRENGTH_OF[v];
        for (const f of out.facts.filter((x) => anchors.includes(x.slot))) f.strength = strength ?? f.strength;
        continue;
      }
      const subSlot = `M.${s.id}`;
      if (s.type === 'tap' || s.type === 'pick') {
        const option = s.options.find((x) => x.value === (Array.isArray(v) ? v[0] : v));
        if (!option) continue;
        out.facts.push(optionFact({ ...sub, as: sub.as ?? q.as ?? 'background' }, mod, now, option, subSlot));
      } else {
        const predicate = s.role === 'why' ? 'values' : s.type === 'story' ? 'story' : (q.as === 'style' ? 'background' : q.as ?? 'background');
        out.facts.push(textFact({ ...sub, as: predicate }, mod, now, v, subSlot, predicate));
        if (s.type === 'story' || words(v) > LONG_WORDS) {
          out.extract.push({ qid: s.id, slot: subSlot, question: s.text, answer: String(v).trim(), branch: s.branch, tier: q.tier, disclosure: q.disclosure, current: Boolean(q.current) });
        }
      }
      if (s.role === 'why') {
        // A reason sits one tier deeper (A7: why-chains are deep).
        out.facts.at(-1).depthTier = 'deep';
        for (const from of anchors) out.links.push({ type: 'WHY', from, to: subSlot });
      } else {
        for (const to of anchors) out.links.push({ type: 'BRANCH_OF', from: subSlot, to });
      }
    }
  }
  return out;
}

/** Core values' brain-map place (A4): branch + depth tier for a section-B fact, and its optional "say more" as a fact. */
export function coreValueFacts(answersB = {}) {
  const B = QUESTIONS.sections.find((s) => s.id === 'B');
  const facts = [];
  for (const item of B.items) {
    const a = answersB[item.id];
    const meta = CORE_VALUES[item.id];
    const more = String(a?.more ?? '').trim();
    if (!meta || !a?.answer || !more) continue;
    facts.push({
      source: 'questionnaire_choice', confidence: 1, polarity: 1, slot: `B.${item.id}.more`, predicate: item.predicate === 'lifestyle' ? 'lifestyle' : 'values',
      object: `${meta.more.toLowerCase().replace(/[?.]$/, '')}: ${clip(more)}`, strength: 0.6, branch: [meta.area, item.id.replace(/_/g, ' '), 'in my words'],
      depthTier: meta.tier, disclosure: meta.disclosure ?? 'public', ...(UNSURE_TEXT.test(more) && { uncertain: true }),
      evidence: answerRef(`B.${item.id}.more`, more),
    });
  }
  return facts;
}

/** A core value's area + tier, for its structured fact. */
export const coreValuePlace = (attribute) => (CORE_VALUES[attribute] ? { branch: [CORE_VALUES[attribute].area, attribute.replace(/_/g, ' ')], depthTier: CORE_VALUES[attribute].tier } : {});

/** Trait picks across all modules → { trait: mean score } (A4 "(trait)"). */
export function moduleTraitScores(M = {}) {
  const sums = {};
  for (const [moduleId, answers] of Object.entries(M ?? {})) {
    for (const q of moduleOf(moduleId)?.questions ?? []) {
      if (!q.trait || !isSet(answers?.[q.id])) continue;
      for (const [trait, map] of Object.entries(q.trait)) {
        const score = map[answers[q.id]];
        if (score != null) (sums[trait] ??= []).push(score);
      }
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([t, xs]) => [t, Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000]));
}

/** T8 "your opinions are usually…" → a prior for how often the agent hedges (A6). null when unanswered. */
export const HEDGE_PRIOR = { very_sure: 0.1, depends: 0.35, i_change_my_mind_a_lot: 0.6 };
export const hedgePriorOf = (answers) => HEDGE_PRIOR[answers?.M?.T?.T8] ?? null;

/**
 * Brain strength (A1): per module, how many of its questions are answered (a today's-story alias counts), and which
 * branches are filled. → { modules: { [id]: { answered, total, done } }, filled, total }
 */
export function moduleProgress(answers = {}) {
  const modules = {};
  let filled = 0, total = 0;
  for (const id of Object.keys(QUESTIONS_BY_MODULE)) {
    const qs = QUESTIONS_BY_MODULE[id];
    const answered = qs.filter((q) => isSet(answers.M?.[id]?.[q.id]) || (q.alias && isSet(answers.C?.[q.alias.slice(2)]))).length;
    modules[id] = { answered, total: qs.length, done: answered >= Math.ceil(qs.length * 0.6) };
    filled += answered; total += qs.length;
  }
  return { modules, filled, total };
}
const QUESTIONS_BY_MODULE = Object.fromEntries([...new Set([...QUESTION_BY_ID.values()].map((q) => q.module))].map((id) => [id, moduleOf(id).questions]));
