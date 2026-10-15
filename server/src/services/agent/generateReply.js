// One agent turn: draft (brief opener or LLM) → guard → at most one regeneration → safe fallback.
import { z } from 'zod';
import { chatJSON } from '../llm/client.js';
import * as agentReply from '../prompts/agentReply.js';
import { capLength, checkDraft, cleanText, oneQuestion, safeReply } from './guard.js';

const nullableText = z.preprocess((v) => (typeof v === 'string' && v.trim() && !/^(null|none)$/i.test(v.trim()) ? v.trim() : null), z.string().max(300).nullable());
const replySchema = z.object({
  reply: z.string().trim().min(1).max(1000),
  usedFactIds: z.array(z.string()).catch([]).default([]),
  targets: nullableText.catch(null).default(null),
  unknownAboutMe: nullableText.catch(null).default(null),
  wantsToEnd: z.preprocess((v) => v === true || v === 'true', z.boolean()),
});

// Replies use Super with reasoning off (~2-5 s). Nano without reasoning echoed the other side and wrote generic
// drafts; with reasoning it took 10-40 s and ran out of tokens mid-thought. Both measured on NVIDIA, Oct 2026.
const REPLY = { tier: 'mid', reasoning: false };

const finish = (draft, ctx) => ({
  ...draft,
  usedFactIds: draft.usedFactIds.filter((id) => /^F\d+$/.test(id)), // models sometimes put field names in here
  reply: capLength(oneQuestion(cleanText(draft.reply, ctx.firstName)), ctx).slice(0, 300),
});

/**
 * → { reply, usedFactIds (ObjectIds), targets, unknownAboutMe, wantsToEnd, fallback }
 * Opening turn: the brief's opener is tried first (no LLM call if it passes the guard).
 */
export async function generateReply({ ctx, userId, matchId }) {
  // A sincere "are you a bot?" always gets the honest answer (consent covers AI handling). Deterministic: in testing the
  // model hedged ("…but it's really me typing") often enough that a non-negotiable rule can't depend on it.
  if (ctx.askedIfAI) {
    const reply = ctx.lowercase ? "haha fair question! yes, i use the app's AI assistant for the first few chats 🙂" : "Haha fair question! Yes, I use the app's AI assistant for the first few chats 🙂";
    return { reply, usedFactIds: [], targets: null, unknownAboutMe: null, wantsToEnd: false, fallback: false };
  }
  const opening = ctx.transcript.length === 0;
  const agendaIds = new Set(ctx.agenda.map((a) => a.match(/^\[(\w+)\]/)?.[1]));
  let warning = null;
  const attempts = [];
  if (opening && ctx.opener) attempts.push(() => ({ reply: ctx.opener, usedFactIds: [], targets: null, unknownAboutMe: null, wantsToEnd: false }));
  attempts.push(null, null, 'no-self'); // two LLM attempts (the second carries the warning), then one that says nothing about the user

  for (const make of attempts) {
    if (make === 'no-self') warning = `${warning} This time say NOTHING about ${ctx.firstName} at all: react to their message and ask one light question about them.`;
    const raw = typeof make === 'function' ? make() : await chatJSON({
      ...REPLY, schema: replySchema, purpose: 'agent-reply', userId, matchId, temperature: 0.8,
      messages: agentReply.build({ ...ctx, focus: make === 'no-self' ? null : ctx.focus, opening, warning }),
    });
    const draft = finish(raw, ctx);
    if (!draft.reply) { warning = 'it was empty'; continue; }
    const problems = await checkDraft({ draft, ctx, userId, matchId, selfFree: make === 'no-self' });
    if (!problems.length) {
      return {
        reply: draft.reply,
        usedFactIds: draft.usedFactIds.map((id) => ctx.factIds[id]),
        targets: agendaIds.has(draft.targets) ? draft.targets : null,
        unknownAboutMe: draft.unknownAboutMe,
        wantsToEnd: draft.wantsToEnd,
        fallback: false,
      };
    }
    warning = problems.join(' ');
    console.warn(`agent ${matchId}: draft rejected: ${warning}`);
  }
  return { reply: opening ? 'hey! your profile made me smile 😄 how is your week going?' : safeReply(), usedFactIds: [], targets: null, unknownAboutMe: null, wantsToEnd: false, fallback: true };
}
