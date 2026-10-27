// generate (plan 08 §2.4): one LLM call writes my next message(s) under the act plan. Returns the draft plus the
// claim lists the code-side grounding check verifies.
import { z } from 'zod';
import { items } from '../../utils/zodItems.js';
import { chatJSON } from '../llm/client.js';
import * as agentReply from '../prompts/agentReply.js';
import * as agentTurn from '../prompts/agentTurn.js';
import { perceiveSchema } from './perceive.js';
import { cleanText } from '../persona/text.js';

const nullableText = z.preprocess((v) => (typeof v === 'string' && v.trim() && !/^(null|none)$/i.test(v.trim()) ? v.trim() : null), z.string().max(300).nullable());
const schema = z.object({
  messages: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.string()).min(1)).transform((m) => m.map((x) => x.trim()).filter(Boolean).slice(0, 3)),
  claims: items(z.object({ text: z.string().trim().min(1).max(300), factIds: z.array(z.string()).catch([]), stance: z.enum(['positive', 'negative', 'neutral']).catch('neutral') })),
  aboutThem: items(z.object({ text: z.string().trim().min(1).max(300), sourceIds: z.array(z.string()).catch([]) })),
  unknownAboutMe: nullableText.catch(null).default(null),
  end: z.preprocess((v) => v === true || v === 'true', z.boolean()).catch(false),
  covers: z.array(z.coerce.string()).catch([]).default([]), // plan 34: the read items this reply responds to
});

/** → { messages, claims, aboutThem, unknownAboutMe, end } (messages cleaned). */
export async function generate({ prompt, tier = 'mid', temperature, userId, matchId, warning }) {
  const out = await chatJSON({ tier, reasoning: false, temperature, schema, purpose: 'agent-reply', userId, matchId, messages: agentReply.build({ ...prompt, warning }) });
  return { ...out, messages: out.messages.map((m) => cleanText(m, prompt.firstName)).filter(Boolean) };
}

/** Plan 30 S1: read their message AND write mine in ONE call. → { read (perceive JSON), draft } */
export async function generateTurn({ prompt, read, tier = 'mid', temperature, userId, matchId, warning }) {
  const out = await chatJSON({
    tier, reasoning: false, temperature, schema: schema.extend({ read: perceiveSchema }), purpose: 'agent-turn', userId, matchId,
    messages: agentTurn.build({ reply: { ...prompt, warning }, read }),
  });
  const { read: perceived, ...draft } = out;
  return { read: perceived, draft: { ...draft, messages: draft.messages.map((m) => cleanText(m, prompt.firstName)).filter(Boolean) } };
}
