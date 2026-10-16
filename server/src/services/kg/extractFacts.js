// One free-text answer → v2 facts about its author (plan 05 §5 steps 2–3): extract, verbatim-quote check, support
// check, sensitivity, plus the answer itself as a `story` fact. Concepts are resolved later by the build.
import { z } from 'zod';
import { chatJSON } from '../llm/client.js';
import * as extractStoryFacts from '../prompts/extractStoryFacts.js';
import * as factSupported from '../prompts/factSupported.js';

const MAX_FACTS = 8;
const CONFIDENCE = { yes: 0.9, unclear: 0.6 };

const schema = z.object({
  summary: z.string().max(200).catch('').default(''),
  facts: z.array(z.object({
    predicate: z.enum(extractStoryFacts.PREDICATES),
    object: z.string().trim().min(1).max(100),
    conceptText: z.string().trim().max(60).catch(''),
    conceptType: z.enum(extractStoryFacts.CONCEPT_TYPES).catch('other'),
    polarity: z.coerce.number().transform((p) => (p < 0 ? -1 : 1)).catch(1),
    strength: z.coerce.number().min(0).max(1).catch(0.5),
    isCurrent: z.boolean().catch(false),
    sensitiveTopic: z.enum(extractStoryFacts.SENSITIVE_TOPICS).catch('none'),
    quote: z.string().trim().min(1).max(400),
  })).catch([]).default([]),
});
const supportSchema = z.object({ results: z.array(z.object({ i: z.coerce.number(), supported: z.enum(['yes', 'no', 'unclear']).catch('unclear') })).catch([]) });

// Case, whitespace and curly quotes don't count as changes; anything else does.
const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** True when `quote` appears verbatim in `text`. Facts failing this are dropped. */
export const isVerbatim = (quote, text) => norm(quote).length >= 3 && norm(text).includes(norm(quote));

/**
 * → { facts, dropped, story }: facts with { predicate, object, conceptText, conceptType, polarity, strength, confidence,
 * source, disclosure, sensitivity, isCurrent, evidence }, and the `story` fact for the whole answer (or null).
 */
export async function extractFacts({ question, answer, userId, source, sourceRef, purpose = 'extract-story-facts' }) {
  const text = String(answer ?? '').trim();
  if (!text) return { facts: [], dropped: 0, story: null };
  const out = await chatJSON({ tier: 'mid', reasoning: false, messages: extractStoryFacts.build({ question, answer: text }), schema, purpose, userId });
  const quoted = out.facts.filter((f) => isVerbatim(f.quote, text)).slice(0, MAX_FACTS);

  // Support check (F9), batched per answer. If the check itself fails, every fact counts as "unclear" (0.6).
  let verdicts = [];
  if (quoted.length) {
    verdicts = (await chatJSON({ tier: 'mid', reasoning: false, temperature: 0, schema: supportSchema, purpose: `${purpose}-support`, userId,
      messages: factSupported.build({ answer: text, facts: quoted }) }).catch((err) => {
      if (err.name === 'BudgetExceededError') throw err;
      return { results: [] };
    })).results;
  }
  const facts = [];
  quoted.forEach((f, idx) => {
    const supported = verdicts.find((v) => v.i === idx + 1)?.supported ?? 'unclear';
    if (supported === 'no') return;
    const sensitive = f.sensitiveTopic !== 'none';
    facts.push({
      predicate: f.predicate, object: f.object, conceptText: f.conceptText || null, conceptType: f.conceptType,
      polarity: f.polarity, strength: f.strength, confidence: CONFIDENCE[supported], source,
      disclosure: sensitive ? 'if_asked' : 'public', sensitivity: { topic: f.sensitiveTopic, sensitive },
      ...(f.isCurrent && { isCurrent: true }),
      evidence: [{ quote: f.quote, sourceRef, at: new Date() }],
    });
  });
  const story = out.summary.trim()
    ? { predicate: 'story', object: out.summary.trim(), strength: 0.6, confidence: 0.9, source, disclosure: 'public', evidence: [{ quote: text, sourceRef, at: new Date() }] }
    : null;
  return { facts, dropped: out.facts.length - facts.length, story };
}
