// Post-checks on a draft before it is sent: grounding, safety, length/style sanity.
import { z } from 'zod';
import { chatJSON } from '../llm/client.js';
import * as claimCheck from '../prompts/claimCheck.js';
import { scanMessage } from '../trust/rules.js';

/** Strip reasoning leftovers, markdown, a "Name:" prefix and wrapping quotes. */
export function cleanText(text, firstName = '') {
  let s = String(text ?? '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/\*\*|__|`/g, '').trim();
  for (const prefix of ['You', firstName].filter(Boolean)) {
    if (s.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)) s = s.slice(prefix.length + 1).trim();
  }
  if (/^["“'].*["”']$/s.test(s)) s = s.slice(1, -1).trim();
  return s.replace(/\s+/g, ' ');
}

/** At most one question: keep everything up to the first "?" when another follows. */
export function oneQuestion(text) {
  const first = text.indexOf('?');
  if (first < 0 || text.indexOf('?', first + 1) < 0) return text;
  return text.slice(0, first + 1).trim();
}

const words = (s) => s.split(/\s+/).filter(Boolean);
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

// Unmistakable Hinglish words: a user who never uses them shouldn't pick them up from the other side.
const HINGLISH_TELLS = new Set(['yaar', 'arre', 'arey', 'bhai', 'acha', 'accha', 'achha', 'haan', 'nahi', 'matlab', 'bilkul', 'pakka', 'bindaas', 'kya']);

/** A 5-word run shared with a recent message (either side) = echoing. → the echoed phrase, or null. */
export function echoOf(text, recentTexts = [], n = 5) {
  const grams = (w) => new Set(w.map((_, i) => w.slice(i, i + n).join(' ')).filter((g) => g.split(' ').length === n));
  const seen = new Set(recentTexts.flatMap((t) => [...grams(norm(t))]));
  return [...grams(norm(text))].find((g) => seen.has(g)) ?? null;
}

/** Trim to whole sentences within 2× the user's median length, unless the other side wrote long. Min cap 12 words. */
export function capLength(text, { medianWords = 10, theirLastWords = 0 } = {}) {
  const cap = Math.max(12, 2 * medianWords);
  if (words(text).length <= cap || theirLastWords > cap) return text;
  let out = '';
  for (const sentence of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    if (words(out + sentence).length > cap) break;
    out += sentence;
  }
  return (out.trim() || text).slice(0, 300); // no sentence boundary to cut at: keep it whole rather than cut mid-thought
}

const FIRST_PERSON = /\b(i|i'm|im|i've|ive|i'd|i'll|my|me|mine|myself)\b/i;
const DEFLECTION = /tell you later|good question|need to think|get back to you|another time/i;
const claimSchema = z.object({
  claims: z.array(z.object({ claim: z.string().trim().min(1), factId: z.string().nullable().catch(null).default(null) })).default([]),
});

/**
 * First-person claims in `reply` that no sayable fact supports. Each model must cite a fact id per claim (no valid id =
 * unsupported). Nano and Super (both reasoning off, ~1-3 s) run in parallel and either one can veto: on a 16-case
 * probe each alone caught 12/16, together 14/16, with Super catching overstatements and Nano catching invented facts.
 * ponytail: two calls per checked draft; one Super call with reasoning on scored the same at ~5x the latency.
 */
export async function unsupportedClaims({ reply, ctx, userId, matchId }) {
  const messages = claimCheck.build({ firstName: ctx.firstName, reply, sayable: ctx.sayable, theirLast: ctx.theirLastText });
  const results = await Promise.allSettled(['fast', 'mid'].map((tier) => chatJSON({ tier, reasoning: false, temperature: 0, schema: claimSchema, purpose: 'agent-claim-check', userId, matchId, messages })));
  const budget = results.find((r) => r.status === 'rejected' && r.reason?.name === 'BudgetExceededError');
  if (budget) throw budget.reason;
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw results[0].reason;
  const unsupported = ok.flatMap((r) => r.value.claims.filter((c) => !ctx.factIds[String(c.factId ?? '').replace(/[[\]]/g, '')]).map((c) => c.claim));
  // Noise the checkers sometimes return: a lone pronoun, or the deflection itself.
  return [...new Set(unsupported)].filter((c) => words(c).length >= 3 && !DEFLECTION.test(c) && !c.trim().endsWith('?'));
}

/**
 * → list of problems with a draft (empty = OK to send).
 * Grounding: cited ids must exist; then the claim check. Safety: no contact sharing or money talk.
 */
export async function checkDraft({ draft, ctx, userId, matchId, selfFree = false }) {
  const problems = [];
  const badIds = draft.usedFactIds.filter((id) => !ctx.factIds?.[id]);
  if (badIds.length) problems.push(`it cites fact ids that do not exist (${badIds.join(', ')})`);
  const echo = echoOf(draft.reply, ctx.recentTexts);
  if (echo) problems.push(`it repeats earlier phrasing ("${echo}"); say something new, in ${ctx.firstName}'s own words`);
  const slang = ctx.hinglishRatio < 0.02 && norm(draft.reply).find((w) => HINGLISH_TELLS.has(w));
  if (slang) problems.push(`it uses "${slang}", which ${ctx.firstName} never says`);
  const scan = scanMessage(draft.reply);
  if (scan.severity >= 2) problems.push(`it shares contact details or talks about money (${scan.flags.join(', ')}); keep chatting here instead`);
  // Always checked: answers to "what are you into?" make claims without ever saying I/my/me. Exception: a draft written
  // under "say nothing about yourself" that indeed has no I/my/me is a reaction + question, so the LLM check is skipped.
  if (!problems.length && !(selfFree && !FIRST_PERSON.test(draft.reply))) {
    try {
      const unsupported = await unsupportedClaims({ reply: draft.reply, ctx, userId, matchId });
      if (unsupported.length) problems.push(`it claims things about ${ctx.firstName} that are not in the list: ${unsupported.join('; ')}. Say only listed facts, or deflect and put their question in unknownAboutMe.`);
    } catch (err) {
      if (err.name === 'BudgetExceededError') throw err;
      problems.push('the grounding check could not run'); // fail closed: an unchecked claim is never sent
    }
  }
  return problems;
}

// Last resort after three rejected drafts: react without any claim about the user, and without inviting a story
// ("how did that start?") that the other agent would then have to invent.
const SAFE_REPLIES = ['haha fair 😄', 'oh nice, i like that', 'ha that makes sense'];
export const safeReply = () => SAFE_REPLIES[Math.floor(Math.random() * SAFE_REPLIES.length)];
