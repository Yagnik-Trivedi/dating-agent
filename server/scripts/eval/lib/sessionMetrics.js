// Plan 33 A9: the rows C1 can measure, for one session-mode chat (no LLM). Testing only: these numbers never drive the
// chat. messages: the match's Message docs in order (actPlan, checks, senderId, authoredBy, text); conv: its
// Conversation (sessions, ledger); decisions: its MatchDecision docs; voices: { [userId]: VoiceProfile } (filler rates).
import { KG } from '../../../src/services/kg/config.js';
import { repeatsEarlier } from '../../../src/services/conversation/memory.js';
import { sessionAt } from '../../../src/services/conversation/sessionJudge.js';
import { fillerRates } from '../../../src/services/persona/texture.js';
import { sentencesOf } from '../../../src/services/persona/text.js';

const LAUGH_FORMS = new Set(['haha', 'hahaha', 'lol', 'lmao', 'hehe']);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

/** → { messages, sessions, perSession: [{ n, messages, agentMsgs, questionRate, tokens }], yes, yesSurfaceOnly, yesDeep2,
 *    repeats, fillers: { [userId]: { perMessage, ownRate, ratio } }, hedge: { loose, hedged, rate }, moves } */
export function sessionMetrics({ messages = [], conv = {}, decisions = [], voices = {}, samples = {} }) {
  const sessions = conv.sessions ?? [];
  const tagged = messages.map((m, i) => ({ ...m, session: sessionAt(sessions, i) }));
  const agent = tagged.filter((m) => m.authoredBy === 'agent');
  const perSession = sessions.map((s) => {
    const own = agent.filter((m) => m.session === s.n);
    return { n: s.n, messages: tagged.filter((m) => m.session === s.n).length, agentMsgs: own.length, questionRate: r2(own.filter((m) => m.text.includes('?')).length / (own.length || 1)), tokens: s.tokens ?? null };
  });

  // A yes whose evidence is all surface (coffee, films, food) must never happen; every yes needs ≥ 2 deep positives.
  const yes = decisions.filter((d) => d.decision === 'yes');
  const tiers = (d) => (conv.ledger?.[String(d.userId)]?.positives ?? []).filter((p) => p.theirs).map((p) => p.tier ?? 'surface');
  const yesSurfaceOnly = yes.filter((d) => tiers(d).every((t) => t === 'surface')).length;
  const yesDeep2 = yes.filter((d) => tiers(d).filter((t) => t === 'deep').length >= KG.SESSION_BAR.MIN_DEEP).length;

  // The same question asked by the same side in two different sessions.
  let repeats = 0;
  for (const s of sessions.filter((x) => x.n > 1)) {
    for (const m of agent.filter((x) => x.session === s.n)) {
      const earlier = agent.filter((x) => x.session < s.n && String(x.senderId) === String(m.senderId)).flatMap((x) => sentencesOf(x.text)).filter((q) => q.includes('?'));
      repeats += sentencesOf(m.text).filter((q) => q.includes('?') && repeatsEarlier(q, earlier)).length;
    }
  }

  // Fillers per message (laughs apart) vs the user's own rate.
  const fillers = {};
  for (const u of [...new Set(agent.map((m) => String(m.senderId)))]) {
    const mine = agent.filter((m) => String(m.senderId) === u && m.checks?.texture);
    const used = mine.reduce((t, m) => t + (m.checks.texture.used ?? []).filter((f) => !LAUGH_FORMS.has(f)).length, 0);
    const rates = voices[u]?.fillers ?? fillerRates(samples[u] ?? []);
    const ownRate = Math.min(KG.FILLER_MAX_RATE, Object.values(rates).reduce((a, b) => a + b, 0));
    const perMessage = mine.length ? used / mine.length : null;
    fillers[u] = { perMessage: r2(perMessage), ownRate: r2(ownRate), ratio: ownRate ? r2(perMessage / ownRate) : null, foreignStripped: mine.reduce((t, m) => t + (m.checks.texture.stripped ?? []).length, 0) };
  }
  const loose = agent.reduce((t, m) => t + (m.checks?.texture?.hedge?.loose ?? 0), 0);
  const hedged = agent.reduce((t, m) => t + (m.checks?.texture?.hedge?.hedged ?? 0), 0);
  const moves = agent.map((m) => m.actPlan?.move ?? (m.actPlan?.fromBrief ? 'opener' : null)).filter(Boolean).reduce((o, k) => ({ ...o, [k]: (o[k] ?? 0) + 1 }), {});
  return {
    messages: messages.length, sessions: sessions.length, perSession, yes: yes.length, yesSurfaceOnly, yesDeep2, repeats,
    fillers, hedge: { loose, hedged, rate: loose ? r2(hedged / loose) : null }, moves,
    tokens: sessions.reduce((t, s) => t + (s.tokens ?? 0), 0),
  };
}
