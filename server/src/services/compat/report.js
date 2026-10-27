// The user's view of their own judge's decision (plan 09 §2). Never the other side's decision or reasons.
import mongoose from 'mongoose';
import { KgFact } from '../../models/KgFact.js';
import { MatchDecision } from '../../models/MatchDecision.js';
import { Profile } from '../../models/Profile.js';

/** What the user sees (Checkpoint A): yes → Compatible, unsure → Maybe, no → Not compatible. */
export const LABEL = Object.freeze({ yes: 'compatible', unsure: 'maybe', no: 'incompatible' });
const RANK = { incompatible: 0, maybe: 1, compatible: 2 };
/** The match status is the "lower" of the two labels. */
export const lowerVerdict = (a, b) => (RANK[a] <= RANK[b] ? a : b);

/** My latest decision on this match (a follow-up round would add a newer one). */
export const myDecision = (matchId, userId) => MatchDecision.findOne({ matchId, userId }).sort({ createdAt: -1 }).lean();

/** My report for the UI. null until my judge has run. */
export async function reportFor(matchId, viewerId) {
  const d = await myDecision(matchId, viewerId);
  if (!d) return null;
  const item = (x) => ({ text: x.why, quote: x.quote, messageIds: x.messageId ? [String(x.messageId)] : [], ...(x.severity && { severity: x.severity }), ...(x.source && { source: x.source }) });
  return {
    verdict: LABEL[d.decision],
    decision: d.decision,
    confidence: d.confidence,
    summary: d.summaryForUser,
    reasons: (d.positives ?? []).map(item),
    concerns: (d.frictions ?? []).map(item),
    dealbreakerRisk: d.dealbreakerRisk ?? [],
    noFrictionJustification: d.noFrictionJustification ?? null,
    worthAsking: d.worthAsking ?? [],
    icebreakers: d.icebreakers ?? [],
    judgeModel: d.judgeModel ?? null,
    conversationId: d.conversationId,
    evaluatedAt: d.createdAt,
    mattered: await matteredFor(d, viewerId),
  };
}

const WORD = (t) => new Set(String(t ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
const SKIP = new Set(['both', 'with', 'that', 'this', 'your', 'they', 'them', 'their', 'about', 'like', 'likes', 'want', 'wants', 'value', 'values', 'enjoy', 'enjoys']);
/** My facts sharing the most content words with the judge's points (at least one), best first. */
function byOverlap(facts, points) {
  const said = WORD(points.map((p) => `${p.why} ${p.quote ?? ''}`).join(' '));
  return facts.map((f) => ({ f, n: [...WORD(f.object)].filter((w) => !SKIP.has(w) && said.has(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || (b.f.importance ?? 0) - (a.f.importance ?? 0)).map((x) => x.f);
}

/**
 * UI polish A3, the letter's left column "What mattered to you": only MY data. The facts of mine my judge's points
 * rest on (from MY graph) and my own dealbreakers with whether this match passed them. Never anything of theirs.
 */
async function matteredFor(d, viewerId) {
  const points = [...(d.positives ?? []), ...(d.frictions ?? [])];
  const ids = points.map((x) => x.factRef ?? x.factId).filter((id) => mongoose.isValidObjectId(id));
  // Older letters only carry the judge's F-aliases: then my own facts whose words the points mention.
  const mine = { subjectId: viewerId, observerId: null, predicate: { $in: ['likes', 'values', 'lifestyle', 'goal', 'background', 'opinion'] }, disclosure: { $ne: 'private' } };
  const [facts, me] = await Promise.all([
    ids.length ? KgFact.find({ _id: { $in: ids }, subjectId: viewerId, observerId: null }, { object: 1, importance: 1, isDealbreaker: 1, strength: 1 }).lean()
      : KgFact.find(mine, { object: 1, importance: 1, isDealbreaker: 1, strength: 1 }).limit(150).lean().then((all) => byOverlap(all, points)),
    Profile.findOne({ userId: viewerId }, { 'gate.dealbreakers': 1 }).lean(),
  ]);
  const risky = new Set((d.dealbreakerRisk ?? []).map((x) => x.attribute));
  const weight = (f) => (f.isDealbreaker ? 'dealbreaker' : (f.importance ?? f.strength ?? 0) >= 0.9 ? 'high' : (f.importance ?? f.strength ?? 0) >= 0.6 ? 'medium' : null);
  return {
    dealbreakers: (me?.gate?.dealbreakers ?? []).map((a) => ({ attribute: a, label: a.replace(/_/g, ' '), passed: !risky.has(a) })),
    values: facts.slice(0, 4).map((f) => ({ text: f.object, importance: weight(f) })),
  };
}
