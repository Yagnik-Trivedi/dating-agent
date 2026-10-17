// Plan 11 (owner's reduced scope): metrics from SAVED eval conversations, no new chats, no LLM calls.
// Reads the pairs in eval/raw.json and their latest conversation in the DB (eval.js keeps the last run per pair).
//   node scripts/eval/metrics.js   → eval/results/metrics.md
// - style fidelity: the agent's messages vs the persona's real replies (seed E answers), normalised L1 over 5 features
// - language fidelity: L1 over the language mix, code-switch rate difference, script kept (Devanagari stays Devanagari)
// - conversation stats: ask-back rate, distinct-2, reply-length spread vs real, disagreements (+ resolved), topic
//   steering, fallbacks
// - observer accuracy: A's notes about B vs B's own graph (same concept + polarity, or same attribute + value)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import { ChatEvent } from '../../src/models/ChatEvent.js';
import { KgFact } from '../../src/models/KgFact.js';
import { Match } from '../../src/models/Match.js';
import { Message } from '../../src/models/Message.js';
import { User } from '../../src/models/User.js';
import { tagLanguageHeuristic } from '../../src/services/kg/language.js';
import { measure } from '../seed/lib/measure.js';

const ROOT = new URL('../../', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('eval/raw.json', ROOT), 'utf8'));
const pairs = JSON.parse(readFileSync(new URL('seed/pairs.json', ROOT), 'utf8'));
const personas = new Map(JSON.parse(readFileSync(new URL('seed/personas.json', ROOT), 'utf8')).map((p) => [p.email, p]));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const wordsOf = (t) => t.split(/\s+/).filter(Boolean);

/** Style features of a list of messages (0..1 each, words capped at 30). */
function features(texts) {
  const m = measure({ answers: { E: Object.fromEntries(texts.map((t, i) => [`x${i}`, t])) } });
  const q = texts.filter((t) => t.includes('?')).length / (texts.length || 1);
  const lower = texts.filter((t) => /^\p{Ll}/u.test(t.trim())).length / (texts.length || 1);
  return { m, vector: [Math.min(m.avgWords, 30) / 30, Math.min(m.emoji, 2) / 2, m.endPunct, q, lower] };
}
const l1 = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
const mixL1 = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce((s, k) => s + Math.abs((a[k] ?? 0) - (b[k] ?? 0)), 0) / 2;
const hasDevanagari = (texts) => texts.some((t) => /\p{Script=Devanagari}/u.test(t));

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const voiceRows = [], convRows = [], obsRows = [];
const samples = []; // { name, real: [...], agent: [...] } for the human "which is real?" export
for (const r of Object.values(raw).filter((x) => x.run === 1)) {
  const pair = pairs.find((p) => p.id === r.id);
  const users = await User.find({ email: { $in: [pair.a, pair.b] } }, { email: 1, name: 1 }).lean();
  if (users.length < 2) continue;
  const match = await Match.findOne({ users: { $all: users.map((u) => u._id) } }).lean();
  if (!match) continue;
  const messages = await Message.find({ matchId: match._id }).sort({ createdAt: 1 }).lean();
  const agent = messages.filter((m) => m.authoredBy === 'agent');
  if (!agent.length) continue; // gated / fake: no conversation
  const events = await ChatEvent.find({ matchId: match._id }).lean();

  // Per side: voice + language fidelity, observer accuracy.
  for (const u of users) {
    const other = users.find((x) => String(x._id) !== String(u._id));
    const mine = agent.filter((m) => String(m.senderId) === String(u._id)).map((m) => m.text);
    const real = Object.values(personas.get(u.email)?.answers?.E ?? {});
    if (mine.length && real.length) {
      const a = features(mine), b = features(real);
      const switchRate = (texts) => texts.filter((t) => tagLanguageHeuristic(t).codeSwitch).length / texts.length;
      samples.push({ name: u.name, real, agent: mine });
      voiceRows.push({
        pair: r.id, name: u.name, n: mine.length, style: l1(a.vector, b.vector), lang: mixL1(a.m.mix, b.m.mix),
        cs: Math.abs(switchRate(mine) - switchRate(real)), scriptKept: hasDevanagari(real) ? hasDevanagari(mine) : null,
        words: [a.m.avgWords, b.m.avgWords],
      });
    }
    const [notes, self] = await Promise.all([
      KgFact.find({ observerId: u._id, subjectId: other._id, matchId: match._id }).lean(),
      KgFact.find({ subjectId: other._id, observerId: null }).lean(),
    ]);
    const sign = (f) => (f.predicate === 'dislikes' || f.polarity === -1 ? -1 : 1);
    const checkable = notes.filter((n) => n.conceptId || n.attribute);
    const correct = checkable.filter((n) => self.some((f) => (n.attribute ? f.attribute === n.attribute && f.value === n.value : String(f.conceptId) === String(n.conceptId) && sign(f) === sign(n))));
    // Recall: their concept facts whose label they actually mentioned in their messages.
    const theirText = messages.filter((m) => String(m.senderId) === String(other._id)).map((m) => m.text.toLowerCase()).join(' ');
    const mentioned = self.filter((f) => f.conceptId && f.object && f.object.length >= 4 && theirText.includes(f.object.toLowerCase()));
    const caught = mentioned.filter((f) => notes.some((n) => String(n.conceptId) === String(f.conceptId)));
    obsRows.push({ pair: r.id, name: u.name, notes: notes.length, checkable: checkable.length, correct: correct.length, mentioned: mentioned.length, caught: caught.length });
  }

  // Conversation stats.
  const texts = agent.map((m) => m.text);
  const bigrams = texts.flatMap((t) => { const w = wordsOf(t.toLowerCase()); return w.slice(1).map((x, i) => `${w[i]} ${x}`); });
  const real = users.flatMap((u) => Object.values(personas.get(u.email)?.answers?.E ?? {}));
  convRows.push({
    pair: r.id, expected: r.expected, predicted: r.predicted, msgs: agent.length, stop: r.stopReason,
    askBack: texts.filter((t) => t.includes('?')).length / texts.length,
    distinct2: new Set(bigrams).size / (bigrams.length || 1),
    lenSd: [sd(texts.map((t) => wordsOf(t).length)), sd(real.map((t) => wordsOf(t).length))],
    disagreements: events.filter((e) => e.type === 'disagreement').length, resolved: events.filter((e) => e.type === 'disagreement_resolved').length,
    steered: agent.filter((m) => m.actPlan?.topic?.kind === 'agenda').length,
    fallbacks: agent.filter((m) => m.checks?.fallback === 'template').length, constrained: agent.filter((m) => m.checks?.fallback === 'constrained').length,
  });
}
await mongoose.disconnect();

const sum = (rows, k) => rows.reduce((s, x) => s + x[k], 0);
const kept = voiceRows.filter((v) => v.scriptKept !== null);
const md = [
  '# Metrics from saved conversations (no new chats)', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval/metrics.js\` from the last eval run of ${convRows.length} conversations (\`eval/raw.json\`).`, '',
  '## Voice and language fidelity (agent messages vs the persona\'s real replies; 0 = identical)', '',
  `- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean ${f2(mean(voiceRows.map((v) => v.style)))}`,
  `- **Language-mix distance** (L1/2 over the mix): mean ${f2(mean(voiceRows.map((v) => v.lang)))}; **code-switch rate difference**: mean ${f2(mean(voiceRows.map((v) => v.cs)))}`,
  `- **Script kept** (Devanagari personas still write Devanagari): ${kept.filter((v) => v.scriptKept).length}/${kept.length}`, '',
  '| pair | persona | agent msgs | style | language mix | code-switch Δ | avg words agent / real |', '|---|---|---|---|---|---|---|',
  ...voiceRows.map((v) => `| ${v.pair} | ${v.name} | ${v.n} | ${f2(v.style)} | ${f2(v.lang)} | ${f2(v.cs)} | ${v.words.map((w) => w.toFixed(1)).join(' / ')} |`), '',
  '## Conversation stats', '',
  `- **Ask-back rate**: ${f2(mean(convRows.map((c) => c.askBack)))} · **distinct-2**: ${f2(mean(convRows.map((c) => c.distinct2)))} · **disagreements**: ${sum(convRows, 'disagreements')} (${sum(convRows, 'resolved')} resolved)`,
  `- **Fallbacks**: ${sum(convRows, 'fallbacks')} template / ${sum(convRows, 'constrained')} constrained of ${sum(convRows, 'msgs')} agent messages`, '',
  '| pair | expected → predicted | agent msgs | stop | ask-back | distinct-2 | length sd agent / real | disagreements | steered | fallbacks |', '|---|---|---|---|---|---|---|---|---|---|',
  ...convRows.map((c) => `| ${c.pair} | ${c.expected} → ${c.predicted} | ${c.msgs} | ${c.stop ?? '—'} | ${f2(c.askBack)} | ${f2(c.distinct2)} | ${c.lenSd.map(f2).join(' / ')} | ${c.disagreements} (${c.resolved}) | ${c.steered} | ${c.fallbacks} + ${c.constrained} constrained |`), '',
  '## Observer accuracy (my notes about them vs their own graph)', '',
  `- **Precision**: ${sum(obsRows, 'correct')}/${sum(obsRows, 'checkable')} checkable notes match their graph (same concept + polarity, or same attribute + value) = ${f2(sum(obsRows, 'correct') / (sum(obsRows, 'checkable') || 1))}`,
  `- **Recall**: ${sum(obsRows, 'caught')}/${sum(obsRows, 'mentioned')} of their facts they mentioned in chat were noted = ${f2(sum(obsRows, 'caught') / (sum(obsRows, 'mentioned') || 1))}`, '',
  '| pair | observer | notes | checkable | correct | mentioned by them | noted |', '|---|---|---|---|---|---|---|',
  ...obsRows.map((o) => `| ${o.pair} | ${o.name} | ${o.notes} | ${o.checkable} | ${o.correct} | ${o.mentioned} | ${o.caught} |`), '',
].join('\n');
// "Which is real?" export for the team (plan 11 B3): 20 randomised real-vs-agent pairs, key kept separately.
mkdirSync(new URL('eval/labels/', ROOT), { recursive: true });
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
const pickR = (xs) => xs[Math.floor(rnd() * xs.length)];
const quizPairs = samples.length ? Array.from({ length: 20 }, (_, i) => {
  const s = samples[i % samples.length];
  const realFirst = rnd() < 0.5;
  const [real, agent] = [pickR(s.real), pickR(s.agent)];
  return { id: i + 1, name: s.name, a: realFirst ? real : agent, b: realFirst ? agent : real, real: realFirst ? 'A' : 'B' };
}) : [];
const csvCell = (t) => `"${String(t).replace(/"/g, '""')}"`;
writeFileSync(new URL('eval/labels/real-vs-agent.csv', ROOT), `${['id,persona,A,B,your_guess (A|B)', ...quizPairs.map((q) => [q.id, q.name, csvCell(q.a), csvCell(q.b), ''].join(','))].join('\n')}\n`);
writeFileSync(new URL('eval/labels/real-vs-agent-key.csv', ROOT), `${['id,real', ...quizPairs.map((q) => `${q.id},${q.real}`)].join('\n')}\n`);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
writeFileSync(new URL('eval/labels/real-vs-agent.html', ROOT), `<!doctype html><meta charset="utf-8"><title>Which is real?</title><style>body{font:16px system-ui;max-width:720px;margin:2em auto;padding:0 1em}li{margin:1em 0}p{margin:.3em 0}</style><h1>Which message did the real person write?</h1><p>One of each pair is from the persona's own answers, the other from their AI agent. Note A or B; the key is in real-vs-agent-key.csv.</p><ol>${quizPairs.map((q) => `<li><b>${esc(q.name)}</b><p>A: ${esc(q.a)}</p><p>B: ${esc(q.b)}</p></li>`).join('')}</ol>\n`);

mkdirSync(new URL('eval/results/', ROOT), { recursive: true });
writeFileSync(new URL('eval/results/metrics.md', ROOT), `${md}\n`);
console.log(md);
