// Plan 09 live checks (unit tests for the validators and settle/handoff are in test/judge.test.js):
//   node scripts/simulate.js seed01@demo.local seed04@demo.local    designed compatible pair (run first for step 4)
//   node scripts/judge-check.js
// 1. Anti-smoking fixture (high importance, not a dealbreaker) × a human defending smoking → her judge lists it as a
//    friction with a verbatim quote. 2. A smoking dealbreaker that surfaces only in chat → `no` + dealbreakerRisk, ONE
//    wind-down in her voice, closed, notes compacted; "Talk anyway" only for the "no" side. 3. One judge call per side;
//    DB spy: the judge reads only its own user's graph, notes and events, plus the transcript. 4. The simulate pair:
//    mutual continue → handed_off + reveal, notes kept. 5. Date ideas: only my events + my city, cache, no key → 503.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { ChatEvent } from '../src/models/ChatEvent.js';
import { Conversation } from '../src/models/Conversation.js';
import { InboxItem } from '../src/models/InboxItem.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { MatchDecision } from '../src/models/MatchDecision.js';
import { Message } from '../src/models/Message.js';
import { Profile } from '../src/models/Profile.js';
import { SearchCache } from '../src/models/SearchCache.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';
import { stopConversation } from '../src/services/agent/index.js';
import { sendMessage } from '../src/services/chat.js';
import { decide, revealFor } from '../src/services/compat/index.js';
import { isVerbatim } from '../src/services/kg/extractFacts.js';
import { questionnaireFacts } from '../src/services/kg/questionnaireFacts.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { buildGate } from '../src/services/match/gate.js';
import { createMatch } from '../src/services/matches.js';
import { enqueue } from '../src/services/jobs/queue.js';
import { dateIdeasFor } from '../src/services/tavily/dateIdeas.js';
import { readsOfOther, startSpy, stopSpy } from './lib/dbSpy.js';
import { NO_PACING } from './lib/runPair.js';
import './lib/worker.js'; // job worker: pipeline, agent turns, judges, compaction

Object.assign(env, NO_PACING);
env.LLM_DAILY_CALLS_PER_USER = Math.max(env.LLM_DAILY_CALLS_PER_USER, 5000);
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36);
const created = [];
const B_OK = { smoking: { answer: 'never', importance: 'low' }, looking_for: { answer: 'long_term', importance: 'low' }, kids: { answer: 'yes', importance: 'low' }, drinking: { answer: 'socially', importance: 'low' } };
const PHOTO = 'https://api.dicebear.com/9.x/notionists/svg?seed=';

async function person({ name, gender, interestedIn, B = B_OK, agentMode = 'off', bio, interests = [] }) {
  const user = await User.create({ email: `judge-${name.toLowerCase()}-${tag}@check.test`, passwordHash: 'x', name, consentAgent: true, consentAt: new Date(), agentMode, onboarding: { status: 'done', answers: { B } } });
  created.push(user._id);
  await Profile.create({ userId: user._id, name, age: 28, city: 'Pune', gender, interestedIn, bio, photos: [`${PHOTO}${name}`] });
  const facts = questionnaireFacts({ B, D: { interests } });
  await KgFact.insertMany(facts.map(({ conceptText, conceptType, ...f }) => ({ ...f, subjectId: user._id, weight: f.importance ?? f.strength ?? 0.5 })));
  await buildGate(user._id);
  return user;
}
const waitFor = async (fn, what, secs = 300) => {
  for (let i = 0; i < secs; i++) { const v = await fn(); if (v) return v; await sleep(1000); }
  throw new Error(`timed out waiting for ${what}`);
};
const statusOf = async (id) => (await Match.findById(id, { status: 1 }).lean()).status;
/** Human message, then wait for the agent's reply (or for the chat to end). */
async function say(matchId, from, text) {
  const sent = await sendMessage({ match: await Match.findById(matchId), senderId: from._id, authoredBy: 'human', text });
  await waitFor(async () => (await Message.exists({ matchId, authoredBy: 'agent', createdAt: { $gt: sent.createdAt } })) || (await statusOf(matchId)) !== 'agent_chatting', 'an agent reply', 180);
  await sleep(1500);
}
const decisions = (matchId) => waitFor(async () => {
  const ds = await MatchDecision.find({ matchId }).lean();
  return ds.length === 2 && !['agent_chatting', 'evaluating'].includes(await statusOf(matchId)) && ds;
}, 'both judges + settle', 600);
const show = (who, d) => {
  console.log(`  ${who}: ${d.decision.toUpperCase()} (${d.confidence}) by ${d.judgeModel ?? 'code'}${d.validation?.reasked ? ', re-asked' : ''} — ${d.summaryForUser}`);
  for (const p of d.positives) console.log(`    ✓ "${p.quote}" → ${p.why}`);
  for (const f of d.frictions) console.log(`    ⚠ "${f.quote}" (sev ${f.severity}) → ${f.why}`);
  for (const r of d.dealbreakerRisk) console.log(`    ✖ dealbreaker ${r.attribute}: "${r.quote}"`);
};
async function verbatimReceipts(matchId, d) {
  const msgs = new Map((await Message.find({ matchId }).lean()).map((m) => [String(m._id), m.text]));
  for (const x of [...d.positives, ...d.frictions]) assert.ok(isVerbatim(x.quote, msgs.get(String(x.messageId)) ?? ''), `"${x.quote}" is verbatim in its message`);
}

const recs = startSpy();
try {
  // 1. Anti-smoking (high importance, NOT a dealbreaker) × a human who defends smoking.
  const anu = await person({ name: 'Anu', gender: 'woman', interestedIn: ['man'], agentMode: 'auto', bio: 'Runner, early riser.', B: { ...B_OK, smoking: { answer: 'never', importance: 'high' } }, interests: [{ name: 'running', intensity: 'obsessed' }] });
  const dev = await person({ name: 'Dev', gender: 'man', interestedIn: ['woman'], bio: 'Product manager, weekend cyclist.' });
  const m1 = await createMatch(dev._id, anu._id);
  await waitFor(async () => (await statusOf(m1._id)) === 'agent_chatting', 'agent_chatting');
  await waitFor(() => Message.exists({ matchId: m1._id }), "Anu's opener", 120);
  await say(m1._id, dev, 'hey anu! i cycle most weekends, mostly around the hills near pune');
  await say(m1._id, dev, 'honestly i think smoking is totally fine, i smoke socially and everyone should relax about it');
  await say(m1._id, dev, 'what about you, what do you do on weekends?');
  await stopConversation(m1._id, 'natural');
  const d1 = await decisions(m1._id);
  const anuD = d1.find((d) => String(d.userId) === String(anu._id));
  show('Anu', anuD);
  show('Dev', d1.find((d) => String(d.userId) === String(dev._id)));
  await verbatimReceipts(m1._id, anuD);
  assert.ok(anuD.frictions.some((f) => /smok/i.test(f.quote + f.why)), "Anu's judge lists the smoking disagreement as a friction");
  console.log(`✓ anti-smoking pair → Anu's judge: smoking friction with a verbatim quote; match ${await statusOf(m1._id)}`);

  // 2. A smoking dealbreaker that the gate can't see (his profile says "never"), surfacing in chat.
  const tara = await person({ name: 'Tara', gender: 'woman', interestedIn: ['man'], agentMode: 'auto', bio: 'Architect, plant mom, chai over coffee.', B: { ...B_OK, smoking: { answer: 'never', importance: 'high', dealbreaker: true, accepts: ['never'] } }, interests: [{ name: 'architecture', intensity: 'obsessed' }] });
  const kunal = await person({ name: 'Kunal', gender: 'man', interestedIn: ['woman'], bio: 'Musician, late-night drives.' });
  const m2 = await createMatch(kunal._id, tara._id);
  await waitFor(async () => (await statusOf(m2._id)) === 'agent_chatting', 'agent_chatting (the gate passes)');
  await waitFor(() => Message.exists({ matchId: m2._id }), "Tara's opener", 120);
  await say(m2._id, kunal, 'hey tara! i play guitar in a small band, we do gigs around koregaon park');
  await say(m2._id, kunal, 'ngl i smoke regularly, like most days, it helps me unwind after gigs');
  if ((await statusOf(m2._id)) === 'agent_chatting') await say(m2._id, kunal, 'anyway what kind of buildings do you design?');
  if ((await statusOf(m2._id)) === 'agent_chatting') await stopConversation(m2._id, 'natural');
  const conv2 = await Conversation.findOne({ matchId: m2._id }).lean();
  const hints = await ChatEvent.countDocuments({ matchId: m2._id, observerId: tara._id, type: 'dealbreaker_hint' });
  console.log(`  chat ended by ${conv2.endedBy}; Tara's dealbreaker_hint events: ${hints}`);
  assert.ok(hints > 0, 'perceive recorded a dealbreaker_hint');
  const d2 = await decisions(m2._id);
  const taraD = d2.find((d) => String(d.userId) === String(tara._id));
  show('Tara', taraD);
  await verbatimReceipts(m2._id, taraD);
  assert.equal(taraD.decision, 'no');
  assert.ok(taraD.dealbreakerRisk.length, 'dealbreakerRisk listed');
  const closing = await Message.find({ matchId: m2._id, senderId: tara._id, authoredBy: 'agent', createdAt: { $gt: conv2.endedAt } }).lean();
  assert.equal(closing.length, 1, 'exactly one wind-down');
  assert.equal(await statusOf(m2._id), 'closed');
  console.log(`✓ dealbreaker in chat → Tara: no + dealbreakerRisk; one wind-down: "${closing[0].text}"; closed`);

  const compacted = await waitFor(async () => {
    const d = await MatchDecision.findOne({ _id: taraD._id }).lean();
    return d.notesSummary != null && await ChatEvent.exists({ matchId: m2._id, archiveAt: { $ne: null } }) && d;
  }, 'compactNotes', 180);
  console.log(`✓ compactNotes: notesSummary (${compacted.notesSummary.split(/\s+/).length} words) "${compacted.notesSummary.slice(0, 140)}…"; archiveAt set on notes/events/agent messages`);

  if ((d2.find((d) => String(d.userId) === String(kunal._id))).decision !== 'no') {
    await assert.rejects(decide(m2._id, kunal._id, 'continue'), (e) => e.status === 409);
  }
  await decide(m2._id, tara._id, 'continue');
  assert.equal(await statusOf(m2._id), 'maybe');
  assert.equal(await ChatEvent.countDocuments({ matchId: m2._id, archiveAt: { $ne: null } }), 0, 'reopening un-archives');
  console.log('✓ "Talk anyway": 409 for the side that said yes; Tara (no) reopens it as maybe, notes un-archived');

  // 3. One judge call per side; the information boundary.
  await flushUsage();
  for (const m of [m1, m2]) {
    for (const u of (await Match.findById(m._id).lean()).users) {
      const calls = await Usage.find({ matchId: m._id, userId: u, purpose: 'judge' }).lean();
      const ok = calls.filter((c) => c.ok);
      const reask = await Usage.countDocuments({ matchId: m._id, userId: u, purpose: 'judge-reask', ok: true });
      console.log(`  judge ${u}: ${ok.length} ok call (${ok.map((c) => `${c.tier}/${c.model}`).join(', ')}), ${calls.length - ok.length} failed smart attempt(s) before fallback, ${reask} re-ask`);
      assert.equal(ok.length, 1, 'exactly one successful judge call per side');
    }
  }
  const judgeReads = recs.filter((r) => r.actor?.role === 'judge');
  const leaked = readsOfOther(recs, 'judge');
  assert.deepEqual(leaked.map((x) => `${x.model}.${x.op} ${JSON.stringify(x.filter)}`), [], "the judge never reads the other user's data");
  console.log(`✓ boundary: ${judgeReads.length} judge reads (${[...new Set(judgeReads.map((r) => r.model))].join(', ')}); none touch the other user (the transcript is read by matchId)`);

  // 4. The simulate pair: both continue → handed_off + reveal; a handed-off match keeps its notes.
  const [meera, ishaan] = await Promise.all([User.findOne({ email: 'seed01@demo.local' }), User.findOne({ email: 'seed04@demo.local' })]);
  const good = meera && ishaan && await Match.findOne({ users: { $all: [meera._id, ishaan._id] } });
  if (good && ['compatible', 'maybe', 'handed_off'].includes(good.status)) {
    for (const u of [meera, ishaan]) show(u.name, await MatchDecision.findOne({ matchId: good._id, userId: u._id }).lean());
    if (good.status !== 'handed_off') await decide(good._id, meera._id, 'continue');
    const after = good.status === 'handed_off' ? good : await decide(good._id, ishaan._id, 'continue');
    assert.equal(after.status, 'handed_off');
    const reveal = await revealFor(after);
    assert.match(reveal.text, /^The first \d+ messages were handled by your agents/);
    await enqueue('compactNotes', { matchId: String(good._id) }, { dedupeKey: `compact-check:${good._id}:${tag}` }); // must skip a handed-off match
    await sleep(5000);
    assert.equal(await KgFact.countDocuments({ matchId: good._id, archiveAt: { $ne: null } }), 0, 'handed-off match keeps its notes');
    console.log(`✓ Meera × Ishaan (${good.status}): both continue → handed_off; "${reveal.text}"; notes kept`);

    // 5. Date ideas from my own events + my city.
    const spyFrom = recs.length;
    const fake = async () => [
      { title: 'Rajmachi Fort trek', url: 'https://example.test/rajmachi', content: 'Popular monsoon trek near Lonavala.' },
      { title: 'Pagdandi Books Chai Cafe', url: 'https://example.test/pagdandi', content: 'Bookstore cafe in Baner.' },
      { title: 'Sinhagad sunrise hike', url: 'https://example.test/sinhagad', content: 'Short hike with pithla bhakri.' },
      { title: 'Cooking class', url: 'https://example.test/cooking', content: 'Weekend cooking workshop for two.' },
    ];
    await SearchCache.deleteMany({});
    const handed = await Match.findById(good._id);
    if (!env.TAVILY_API_KEY) await assert.rejects(dateIdeasFor(handed, meera._id), (e) => e.status === 503 && e.code === 'DATE_IDEAS_UNAVAILABLE');
    const first = await dateIdeasFor(handed, meera._id, { search: env.TAVILY_API_KEY ? undefined : fake });
    const second = await dateIdeasFor(handed, meera._id, { search: async () => { throw new Error('should be cached'); } });
    assert.ok(first.ideas.length >= 1 && second.cached);
    assert.deepEqual(readsOfOther(recs.slice(spyFrom), 'dateIdeas'), [], 'date ideas read only my own data');
    console.log(`✓ date ideas (${env.TAVILY_API_KEY ? 'Tavily' : 'stubbed search; no key → 503 checked'}): ${first.ideas.map((i) => i.title).join(' · ')}; 2nd call cached; spy: only my data`);
  } else {
    console.log(`(steps 4–5 skipped: run \`node scripts/simulate.js seed01@demo.local seed04@demo.local\` first; that match is ${good?.status ?? 'missing'})`);
  }
  console.log('\nJudge checks passed.');
} finally {
  stopSpy();
  const matchIds = await Match.distinct('_id', { users: { $in: created } });
  await Promise.all([
    Match.deleteMany({ _id: { $in: matchIds } }), Message.deleteMany({ matchId: { $in: matchIds } }), Conversation.deleteMany({ matchId: { $in: matchIds } }),
    ChatEvent.deleteMany({ matchId: { $in: matchIds } }), InboxItem.deleteMany({ matchId: { $in: matchIds } }), MatchDecision.deleteMany({ matchId: { $in: matchIds } }),
    KgFact.deleteMany({ $or: [{ subjectId: { $in: created } }, { matchId: { $in: matchIds } }] }),
    Profile.deleteMany({ userId: { $in: created } }), User.deleteMany({ _id: { $in: created } }),
  ]);
  await flushUsage();
  await mongoose.disconnect();
}
