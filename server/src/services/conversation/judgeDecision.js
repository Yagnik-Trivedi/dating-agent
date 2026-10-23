// The judge's decision, in code (owner's judge fix, 2026-10-18). The LLM only lists evidence; after the quote validators
// this turns it into yes / no / unsure + a confidence. Every number lives in kg/config.js (JUDGE_*).
import { KG } from '../kg/config.js';
import { branchOf, tierOf } from './evidence.js';

// Rounded to 2 decimals before any comparison: 0.7 - 0.05 is 0.6499999… in floating point.
const clamp = (x, lo, hi) => Math.round(Math.min(hi, Math.max(lo, x)) * 100) / 100;

/**
 * positives / frictions: validated ({ quote, why, messageId, theirs, factId, severity }); factId 'F3' → facts.get('F3').
 * dealbreakerRisk: [{ attribute, value }] where value is THEIR stated option (or null if unclear).
 * dealbreakers: { attribute: [values I accept] }. undiscussed: my dealbreaker attributes the chat never settled.
 * A dealbreaker that came up without a clear answer counts as undiscussed (owner's spec: severity 2, doesn't block yes).
 * → { decision, confidence, reason, frictions } (frictions + a severity-2 one per open dealbreaker)
 */
export function judgeDecision({ positives = [], frictions = [], dealbreakerRisk = [], facts = new Map(), dealbreakers = {}, undiscussed = [], cfg = KG }) {
  const C = cfg.JUDGE_CONF;
  const fact = (x) => (x.factId ? facts.get(x.factId) ?? null : null);
  const core = (f) => Boolean(f && (f.isDealbreaker || (f.importance ?? 0) >= cfg.JUDGE_NO_IMPORTANCE));
  const key = (f) => Boolean(f && (f.isDealbreaker || (f.importance ?? 0) >= cfg.JUDGE_KEY_IMPORTANCE
    || (f.predicate === 'likes' && f.polarity !== -1 && (f.strength ?? 0) >= cfg.JUDGE_KEY_STRENGTH)));

  const mine = dealbreakerRisk.filter((d) => dealbreakers[d.attribute]);
  const conflicts = mine.filter((d) => d.value && !dealbreakers[d.attribute].includes(d.value));
  const answered = new Set(mine.filter((d) => d.value).map((d) => d.attribute));
  const open = [...new Set([...undiscussed, ...mine.filter((d) => !d.value).map((d) => d.attribute)])].filter((a) => !answered.has(a));
  const added = open.map((a) => ({
    quote: '', messageId: null, severity: 2, attribute: a, why: `You never found out where they stand on ${a.replace(/_/g, ' ')}: worth asking.`,
  }));
  const allFrictions = [...frictions, ...added];
  const serious = frictions.filter((f) => f.severity >= 3);
  const notable = allFrictions.filter((f) => f.severity === 2).length;
  // Distinct (message, fact) pairs, in their own words, on facts that matter to me.
  const keyPositives = new Set(positives.filter((p) => p.theirs && key(fact(p))).map((p) => `${p.messageId}|${p.factId}`)).size;
  const out = (decision, confidence, reason) => ({ decision, confidence: Math.round(confidence * 100) / 100, reason, frictions: allFrictions });

  if (conflicts.length) return out('no', C.NO_DEALBREAKER, `dealbreaker: ${conflicts.map((d) => `${d.attribute} = ${d.value}`).join(', ')}`);
  const coreHit = serious.find((f) => core(fact(f)));
  if (coreHit) return out('no', C.NO_SERIOUS, `serious friction on ${fact(coreHit).object}`);
  if (keyPositives >= cfg.JUDGE_YES_POSITIVES && !serious.length) {
    const confidence = clamp(C.YES_BASE + C.YES_PER_EXTRA_POSITIVE * (keyPositives - cfg.JUDGE_YES_POSITIVES) - C.YES_PER_NOTABLE_FRICTION * notable, 0, C.YES_MAX);
    if (confidence >= cfg.JUDGE_YES_MIN) return out('yes', confidence, `${keyPositives} positives on what matters to you`);
  }
  const why = serious.length ? 'a serious friction' : `${keyPositives} positive(s) on what matters to you${notable ? `, ${notable} notable friction(s)` : ''}`;
  return out('unsure', clamp(C.UNSURE_BASE + C.UNSURE_PER_EVIDENCE * (keyPositives + allFrictions.length), 0, C.UNSURE_MAX), why);
}

/**
 * Plan 33 (A7), full and demo chats: a yes needs real evidence across a life, at depth, plus chemistry in the chat.
 * Each positive carries the tier and branch of MY fact it bears on (evidence.js); bar: { sessions, messages,
 * minSessions, minMessages, chemistry: { ok, missing }, inconsistencies, lowInterestRun }.
 * → { decision, confidence, reason, frictions, counts: { surface, personal, deep, total, branches }, missing }
 */
function deepDecision({ positives, frictions, dealbreakerRisk, facts, dealbreakers, undiscussed, cfg, bar }) {
  const C = cfg.SESSION_CONF;
  const B = cfg.SESSION_BAR;
  const fact = (x) => (x.factId ? facts.get(x.factId) ?? null : null);
  const core = (f) => Boolean(f && (f.isDealbreaker || (f.importance ?? 0) >= cfg.JUDGE_NO_IMPORTANCE));
  const mine = dealbreakerRisk.filter((d) => dealbreakers[d.attribute]);
  const conflicts = mine.filter((d) => d.value && !dealbreakers[d.attribute].includes(d.value));
  const answered = new Set(mine.filter((d) => d.value).map((d) => d.attribute));
  const open = [...new Set([...undiscussed, ...mine.filter((d) => !d.value).map((d) => d.attribute)])].filter((a) => !answered.has(a));
  const allFrictions = [...frictions, ...open.map((a) => ({ quote: '', messageId: null, severity: 2, attribute: a, why: `You never found out where they stand on ${a.replace(/_/g, ' ')}: worth asking.` }))];
  const serious = frictions.filter((f) => f.severity >= 3);
  const notable = allFrictions.filter((f) => f.severity === 2);

  // Distinct (message, fact) pairs in their words; surface ones count up to SURFACE_MAX in total.
  const counts = { surface: 0, personal: 0, deep: 0 };
  const branches = new Set();
  const seen = new Set();
  for (const p of positives) {
    const f = fact(p);
    const key = `${p.messageId}|${p.factId}`;
    if (!p.theirs || !f || seen.has(key)) continue;
    seen.add(key);
    const tier = p.tier ?? tierOf(f);
    if (tier === 'surface' && counts.surface >= B.SURFACE_MAX) continue;
    counts[tier] = (counts[tier] ?? 0) + 1;
    branches.add(p.branch ?? branchOf(f));
  }
  const total = counts.surface + counts.personal + counts.deep;
  const personal = counts.personal + Math.max(0, counts.deep - B.MIN_DEEP); // extra deep ones stand in for personal
  const stats = { ...counts, total, branches: [...branches] };
  const out = (decision, confidence, reason, missing = []) => ({ decision, confidence: Math.round(confidence * 100) / 100, reason, frictions: allFrictions, counts: stats, missing });

  if (conflicts.length) return out('no', cfg.JUDGE_CONF.NO_DEALBREAKER, `dealbreaker: ${conflicts.map((d) => `${d.attribute} = ${d.value}`).join(', ')}`);
  const coreHit = serious.find((f) => core(fact(f)));
  if (coreHit) return out('no', cfg.JUDGE_CONF.NO_SERIOUS, `serious friction on ${fact(coreHit).object}`);
  if ((bar.lowInterestRun ?? 0) >= B.LOW_INTEREST_SESSIONS) return out('no', C.NO_LOW_INTEREST, `low interest for ${bar.lowInterestRun} sessions in a row`);

  const undiscussedNotable = notable.filter((f) => !f.quote);
  const missing = [
    bar.sessions < bar.minSessions && `${bar.minSessions - bar.sessions} more session(s) of chatting`,
    bar.messages < bar.minMessages && `${bar.minMessages - bar.messages} more messages`,
    total < B.YES_POSITIVES && `${B.YES_POSITIVES - total} more real things in common`,
    branches.size < B.MIN_BRANCHES && `common ground in ${B.MIN_BRANCHES - branches.size} more parts of life`,
    personal < B.MIN_PERSONAL && 'more about how they actually live (stories, people, work)',
    counts.deep < B.MIN_DEEP && 'more about values, the future or how they handle things',
    ...(bar.chemistry?.ok === false ? bar.chemistry.missing.map((m) => `chemistry: ${m}`) : []),
    serious.length && 'a serious friction',
    notable.length > B.MAX_NOTABLE && `${notable.length} notable frictions`,
    undiscussedNotable.length && `talking through ${undiscussedNotable.map((f) => (f.attribute ?? 'a difference').replace(/_/g, ' ')).join(', ')}`,
    (bar.inconsistencies ?? 0) > 0 && "something they said doesn't add up with what they said before",
  ].filter(Boolean);
  if (!missing.length) {
    const confidence = clamp(C.YES_BASE + C.YES_PER_EXTRA_POSITIVE * (total - B.YES_POSITIVES) + C.YES_PER_EXTRA_DEEP * (counts.deep - B.MIN_DEEP) - C.YES_PER_NOTABLE_FRICTION * notable.length, 0, C.YES_MAX);
    if (confidence >= B.YES_MIN) return out('yes', confidence, `${total} positives (${counts.personal} personal, ${counts.deep} deep) across ${branches.size} parts of life, and good chemistry`);
    missing.push('more evidence to outweigh the frictions');
  }
  const U = cfg.JUDGE_CONF;
  return out('unsure', clamp(U.UNSURE_BASE + U.UNSURE_PER_EVIDENCE * (total + allFrictions.length), 0, U.UNSURE_MAX), `still unknown: ${missing.join('; ')}`, missing);
}

/** The decision for a conversation's depth: short = today's judgeDecision, unchanged; full / demo = the A7 bar. */
export const decideFor = (depth, args) => (depth === 'short' || !args.bar ? judgeDecision({ ...args, bar: undefined }) : deepDecision({ cfg: KG, positives: [], frictions: [], dealbreakerRisk: [], facts: new Map(), dealbreakers: {}, undiscussed: [], ...args }));
