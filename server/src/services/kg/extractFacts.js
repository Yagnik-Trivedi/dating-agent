import { z } from 'zod';
import { chatJSON } from '../llm/client.js';
import * as extractStoryFacts from '../prompts/extractStoryFacts.js';

const MAX_FACTS = 8;

const schema = z.object({
  summary: z.string().max(200).default(''),
  facts: z.array(z.object({
    predicate: z.enum(extractStoryFacts.PREDICATES),
    object: z.string().trim().min(1).max(80),
    weight: z.coerce.number().min(0).max(1).catch(0.5),
    quote: z.string().trim().min(1).max(400),
  })).default([]),
});

// Case, whitespace and curly quotes don't count as changes; anything else does.
const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** True when `quote` appears verbatim in `text`. Facts failing this are dropped. */
export const isVerbatim = (quote, text) => norm(quote).length >= 3 && norm(text).includes(norm(quote));

/**
 * One free-text answer → validated facts (no subjectId yet), plus the answer itself as a `story` fact.
 * Every LLM fact's quote must appear verbatim in the answer; the rest are dropped and counted.
 */
export async function extractFacts({ question, answer, userId, source, confidence, purpose = 'extract-story-facts' }) {
  const text = String(answer ?? '').trim();
  if (!text) return { facts: [], dropped: 0 };
  // Reasoning off: literal extraction (quotes are verified below); with reasoning it timed out at 120 s on NVIDIA.
  const out = await chatJSON({ tier: 'mid', reasoning: false, messages: extractStoryFacts.build({ question, answer: text }), schema, purpose, userId });

  const kept = out.facts.filter((f) => isVerbatim(f.quote, text)).slice(0, MAX_FACTS);
  const facts = kept.map((f) => ({
    predicate: f.predicate,
    object: f.object,
    weight: f.weight,
    confidence,
    source,
    disclosure: 'public',
    evidence: [{ quote: f.quote }],
  }));
  if (out.summary.trim()) {
    facts.push({ predicate: 'story', object: out.summary.trim(), weight: 0.6, confidence, source, disclosure: 'public', evidence: [{ quote: text }] });
  }
  return { facts, dropped: out.facts.length - kept.length };
}
