// Plan 31 A10: conversation metrics for one chat, from its lines alone (no LLM). Testing only: these numbers never
// drive the chat. lines: [{ speaker, text, agent, actPlan?, story? }] in order; settled: attributes known before the
// chat (gate / their profile) when the agenda is available (live runs), else null.
// unbridgedQuestionRate (BUG_BY_GEMINI.md section 4): an agent message with a question whose non-question part is
// missing or unrelated to what they said since my last message. sim(a, b) → 0..1; the default is lexical overlap
// (content words, 5-letter stems), so saved transcripts can be measured offline; pass an embedding cosine for the live
// metric (calibrate T by hand first).
import { FORM_ATTRS } from '../../../src/services/conversation/engine.js';
import { readHeuristics } from '../../../src/services/conversation/planAct.js';
import { attributesIn } from '../../../src/services/persona/askedAboutMe.js';
import { isQuestion } from '../../../src/services/persona/contextBuilder.js';
import { substantive } from '../../../src/services/persona/checks.js';
import { sentencesOf } from '../../../src/services/persona/text.js';

const STOP = new Set(['that', 'this', 'with', 'have', 'what', 'your', 'about', 'just', 'really', 'like', 'they', 'there', 'would', 'been', 'from', 'when', 'were', 'also', 'haha', 'honestly', 'yeah']);
const stems = (s) => new Set(String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
/** Share of the first text's content stems found in the second (0..1). */
export const lexicalSim = (a, b) => { const A = stems(a), B = stems(b); return A.size ? [...A].filter((w) => B.has(w)).length / A.size : 0; };
const wc = (s) => String(s).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

/** → per-chat numbers (counts + rates); see the README of A10 for what each means. */
export function convoMetrics(lines, { settled = null, sim = lexicalSim, T = 0.15 } = {}) {
  const agentMsgs = lines.filter((l) => l.agent);
  const out = { agentMsgs: agentMsgs.length, questions: 0, matching: 0, matchingAboutSettled: settled ? 0 : null, matchingReasked: 0, matchingWithSetup: 0, backToBack: 0, unbridged: 0, stories: null, topicChangesWhileTelling: 0, lengthRatios: [] };
  const speakers = [...new Set(lines.map((x) => x.speaker))];
  const heard = new Map(speakers.map((s) => [s, new Set()])); // listener → attributes the other side stated
  const lastAsked = new Map();
  lines.forEach((l, i) => {
    const theirTurn = lines.slice(lines.slice(0, i).map((x) => x.speaker).lastIndexOf(l.speaker) + 1, i).filter((x) => x.speaker !== l.speaker);
    const theirText = theirTurn.map((x) => x.text).join('\n');
    if (l.agent) {
      const sentences = sentencesOf(l.text);
      const qs = sentences.filter((s) => s.includes('?'));
      const hasQ = qs.length > 0;
      const attrs = [...new Set(qs.flatMap((q) => attributesIn(q, { questions: true })).filter((a) => FORM_ATTRS.includes(a)))];
      if (hasQ) out.questions++;
      if (attrs.length) {
        out.matching++;
        if (settled && attrs.some((a) => settled.includes(a))) out.matchingAboutSettled++;
        if (attrs.some((a) => heard.get(l.speaker).has(a))) out.matchingReasked++;
        if (wc(sentences.filter((s) => !s.includes('?')).join(' ')) >= 15) out.matchingWithSetup++;
      }
      const theyAsked = theirTurn.some((x) => isQuestion(x.text));
      if (hasQ && lastAsked.get(l.speaker) && !theyAsked) out.backToBack++;
      if (hasQ && theirText) {
        const said = sentences.filter((s) => !s.includes('?'));
        if (!said.some(substantive) || sim(said.join(' '), theirText) < T) out.unbridged++;
      }
      if (theirText) {
        const h = readHeuristics(theirText);
        if ((h.doing === 'telling' || h.doing === 'venting') && hasQ && (attrs.length || qs.every((q) => lexicalSim(q, theirText) === 0 && stems(q).size > 0))) out.topicChangesWhileTelling++;
        out.lengthRatios.push(wc(l.text) / Math.max(1, wc(theirText)));
      }
      if (l.story != null) out.stories = (out.stories ?? 0) + (l.story ? 1 : 0);
      lastAsked.set(l.speaker, hasQ);
    }
    // What this speaker stated (statements only), heard by the other side.
    const stated = attributesIn(l.text, { questions: false });
    for (const s of speakers) if (s !== l.speaker) stated.forEach((a) => heard.get(s).add(a));
  });
  return { ...out, lengthRatio: median(out.lengthRatios) };
}

/** Sum per-chat results into the A10 table row. */
export function summarise(chats) {
  const sum = (k) => chats.reduce((s, c) => s + (c[k] ?? 0), 0);
  const msgs = sum('agentMsgs');
  const storyChats = chats.filter((c) => c.stories != null);
  return {
    chats: chats.length, agentMsgs: msgs,
    matchingPerChat: chats.map((c) => c.matching), matchingMax: Math.max(0, ...chats.map((c) => c.matching)),
    matchingAboutSettled: chats.some((c) => c.matchingAboutSettled != null) ? sum('matchingAboutSettled') : null,
    matchingReasked: sum('matchingReasked'), matchingWithSetup: sum('matchingWithSetup'),
    questionRate: msgs ? sum('questions') / msgs : NaN, backToBack: sum('backToBack'), unbridgedQuestionRate: msgs ? sum('unbridged') / msgs : NaN,
    stories: storyChats.length ? storyChats.reduce((s, c) => s + c.stories, 0) : null, topicChangesWhileTelling: sum('topicChangesWhileTelling'),
    lengthRatio: median(chats.flatMap((c) => c.lengthRatios)),
  };
}

/** Lines from a saved eval transcript (eval/transcripts/*.md): "N. **Name** (agent|human): text". */
export function parseTranscript(md) {
  const body = md.split(/^## Transcript\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  return body.split('\n').map((l) => l.match(/^\d+\.\s+\*\*(.+?)\*\*\s+\((agent|human)\):\s*(.*)$/)).filter(Boolean)
    .map(([, speaker, who, text]) => ({ speaker, agent: who === 'agent', text }));
}
