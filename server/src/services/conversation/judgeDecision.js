// The judge's decision, in code (owner's judge fix, 2026-10-18). The LLM only lists evidence; after the quote validators
// this turns it into yes / no / unsure + a confidence. Every number lives in kg/config.js (JUDGE_*).
import { KG } from '../kg/config.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

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
