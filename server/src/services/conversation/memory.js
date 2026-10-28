// Plan 33 C1 (A5): memory across sessions. The agent sees the last SESSION_RAW_MESSAGES messages raw; earlier sessions
// reach it only as short summaries, open threads and topics already covered (one cheap call per session), so nothing
// gets asked twice and each session can open with a callback.
import { z } from 'zod';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { items } from '../../utils/zodItems.js';
import { KG } from '../kg/config.js';
import { chatJSON } from '../llm/client.js';
import { nameOf } from '../matches.js';
import { norm } from '../persona/text.js';
import * as sessionSummary from '../prompts/sessionSummary.js';

const schema = z.object({
  summary: z.string().trim().max(800).catch(''),
  threads: items(z.object({ about: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(160) })).catch([]),
  topicsCovered: items(z.string().trim().min(1).max(100)).catch([]),
});

/** The session's messages (up to its end; a human's message during the gap belongs to the next one). */
export async function sessionMessages(conv, n) {
  const s = conv.sessions[n - 1];
  const all = await Message.find({ matchId: conv.matchId, ...(s.endedAt && { createdAt: { $lte: s.endedAt } }) }).sort({ createdAt: 1 }).lean();
  return all.slice(s.startCount);
}

/** The `sessionEnd` job's summary call. A failure stores an empty summary (the chat goes on; logged). */
export async function summarizeSession(conv, match) {
  const n = conv.sessionIndex;
  const names = match.users.map((u) => nameOf(match, u));
  const msgs = await sessionMessages(conv, n);
  const previous = conv.sessions.slice(0, n - 1).map((s) => s.summary).filter(Boolean).join(' ');
  let out = { summary: '', threads: [], topicsCovered: [] };
  try {
    out = await chatJSON({
      tier: 'mid', reasoning: false, temperature: 0, schema, purpose: 'session-summary', matchId: match._id,
      messages: sessionSummary.build({ names, previous, transcript: msgs.map((m) => `${nameOf(match, m.senderId)}: ${m.text}`) }),
    });
  } catch (err) {
    if (err.name === 'BudgetExceededError') throw err;
    console.error(`session summary ${match._id} #${n} failed (${err.message}); the next session goes on without it`);
  }
  // "about" is a first name: map it to the user (anything else is dropped).
  const byName = new Map(match.users.map((u) => [String(nameOf(match, u)).toLowerCase(), String(u)]));
  const threads = out.threads.map((t) => ({ about: byName.get(t.about.toLowerCase().split(/\s+/)[0]), text: t.text })).filter((t) => t.about).slice(0, 4);
  await Conversation.updateOne({ _id: conv._id }, { $set: {
    [`sessions.${n - 1}.summary`]: out.summary, [`sessions.${n - 1}.threads`]: threads, [`sessions.${n - 1}.topicsCovered`]: out.topicsCovered.slice(0, 8),
  } });
  return { ...out, threads };
}

/** What my agent remembers of earlier sessions, for the prompt (empty in session 1). */
export function memoryFor(conv, { me, otherId, myName, theirName }) {
  const done = (conv.sessions ?? []).filter((s) => s.n < (conv.sessionIndex ?? 1) && s.endedAt);
  if (!done.length) return null;
  const who = (u) => (String(u) === String(me) ? `${myName} (you)` : theirName);
  const last = done.at(-1);
  return {
    summaries: done.filter((s) => s.summary).map((s) => `Sitting ${s.n}: ${s.summary}`),
    threads: (last.threads ?? []).map((t) => `${who(t.about)}: ${t.text}`),
    covered: [...new Set(done.flatMap((s) => s.topicsCovered ?? []))],
    // Plan 33: callbacks are about THEM only (my own threads I can mention if they ask).
    theirThreads: (last.threads ?? []).filter((t) => String(t.about) === String(otherId)).map((t) => t.text),
  };
}

/** The last SESSION_RAW_MESSAGES messages, with a marker where a new session started. */
export function rawTranscript(history, conv, label, limit = KG.SESSION_RAW_MESSAGES) {
  const from = Math.max(0, history.length - limit);
  const starts = new Set((conv?.sessions ?? []).filter((s) => s.n > 1).map((s) => s.startCount));
  return history.slice(from).flatMap((m, i) => [...(starts.has(from + i) ? ['--- (some hours later) ---'] : []), label(m)]);
}

const SMALL = new Set(['what', 'when', 'where', 'which', 'with', 'have', 'does', 'your', 'about', 'really', 'that', 'this', 'there', 'they', 'them', 'would', 'could', 'some', 'much', 'more', 'like', 'just', 'kind', 'been', 'into', 'were', 'doing', 'going', 'think', 'feel', 'these', 'days', 'ever', 'also', 'usually']);
const content = (s) => new Set(norm(s).filter((w) => w.length >= 4 && !SMALL.has(w)));

/** A question I already asked in an earlier session (near-duplicate by content words). → the earlier question or null */
export function repeatsEarlier(question, earlier = []) {
  const q = content(question);
  if (q.size < 1) return null;
  return earlier.find((e) => {
    const w = content(e);
    const shared = [...q].filter((x) => w.has(x)).length;
    // One shared word is a repeat only when the new question is about just that thing ("what music are you into?"),
    // not a check-in on it ("how was work today?" after "what do you do for work?").
    return (q.size === 1 && shared === 1) || (shared >= 2 && shared >= Math.ceil(0.6 * Math.min(q.size, w.size)));
  }) ?? null;
}
