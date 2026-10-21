// The user's view of their own judge's decision (plan 09 §2). Never the other side's decision or reasons.
import { MatchDecision } from '../../models/MatchDecision.js';

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
  };
}
