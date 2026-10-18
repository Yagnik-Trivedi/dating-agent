// Plan 09 §1–3: judge validators (offline), then settle → handoff / wind-down / "Talk anyway" / compaction on an
// ephemeral replica set. No LLM: decisions are written directly; the wind-down falls back to its fixed line.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { ChatEvent } from '../src/models/ChatEvent.js';
import { Conversation } from '../src/models/Conversation.js';
import { Job } from '../src/models/Job.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { MatchDecision } from '../src/models/MatchDecision.js';
import { Message } from '../src/models/Message.js';
import { compactNotes } from '../src/services/compat/compactNotes.js';
import { cancelReplies, stopConversation } from '../src/services/agent/scheduler.js';
import { decide, extend, reportFor, revealFor, settle, startEvaluation } from '../src/services/compat/index.js';
import { planAct } from '../src/services/conversation/planAct.js';
import { judgeSchema, validateDecision } from '../src/services/conversation/judge.js';
import { start, stop } from '../scripts/lib/testDb.js';

const oid = () => new mongoose.Types.ObjectId();
const transcript = [
  { id: 'm1', _id: oid(), mine: true, text: 'hey! loved your trekking pics, where was the last one?' },
  { id: 'm2', _id: oid(), mine: false, text: 'Kudremukh! I smoke a bit on treks though, hope that is ok' },
  { id: 'm3', _id: oid(), mine: true, text: 'haha that sounds fun, I mostly do Sahyadri day hikes' },
];
const parse = (o) => judgeSchema.parse({ decision: 'yes', confidence: 0.8, positives: [], frictions: [], dealbreakerRisk: [], noFrictionJustification: null, summaryForUser: 's', ...o });

test('a non-verbatim quote is dropped and asks for a re-ask; a wrong message id is remapped to the real one', () => {
  const out = parse({
    positives: [{ quote: 'loved your trekking pics', why: 'You both trek.', messageId: 'm3' }, { quote: 'we both adore mountains', why: 'Mountains.', messageId: 'm1' }],
    frictions: [{ quote: 'I smoke a bit on treks', why: 'Smoking.', messageId: 'm2', severity: 2 }],
  });
  const { value, problems } = validateDecision(out, { transcript });
  assert.equal(value.positives.length, 1);
  assert.equal(value.positives[0].messageId, String(transcript[0]._id));
  assert.equal(value.frictions[0].messageId, String(transcript[1]._id));
  assert.ok(problems.some((p) => p.includes('not verbatim')));
});

test('a generic positive without a quote is rejected', () => {
  const out = parse({ positives: [{ quote: '', why: 'They were polite and nice.' }], noFrictionJustification: 'Nothing gave pause.' });
  const { value, problems } = validateDecision(out, { transcript });
  assert.equal(value.positives.length, 0);
  assert.ok(problems.some((p) => p.includes('without a verbatim quote')));
});

test('empty frictions need a justification', () => {
  assert.ok(validateDecision(parse({}), { transcript }).problems.some((p) => p.includes('frictions is empty')));
  assert.deepEqual(validateDecision(parse({ noFrictionJustification: 'Everything that matters lined up.' }), { transcript }).problems, []);
});

test('a dealbreaker_hint event without dealbreakerRisk → re-ask', () => {
  const hints = [{ type: 'dealbreaker_hint', label: 'smoking: socially', quote: 'I smoke a bit on treks' }];
  const out = parse({ noFrictionJustification: 'ok' });
  const { value, problems } = validateDecision(out, { transcript, hints });
  assert.ok(problems.some((p) => p.includes('dealbreakerRisk is empty')));
  const ok = validateDecision(parse({ decision: 'no', dealbreakerRisk: [{ attribute: 'smoking', quote: 'I smoke a bit on treks' }], frictions: [{ quote: 'I smoke a bit on treks', why: 'x' }] }), { transcript, hints });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.value.decision, 'no');
});

test('a dealbreakerRisk quote must be their words, not mine', () => {
  const out = parse({ noFrictionJustification: 'x', dealbreakerRisk: [{ attribute: 'smoking', quote: 'I mostly do Sahyadri day hikes' }, { attribute: 'smoking', quote: 'I smoke a bit on treks' }] });
  const { value } = validateDecision(out, { transcript });
  assert.deepEqual(value.dealbreakerRisk.map((d) => d.quote), ['I smoke a bit on treks']);
});

test('a low-confidence yes becomes unsure', () => {
  const just = { noFrictionJustification: 'fine' };
  assert.equal(validateDecision(parse({ ...just, confidence: 0.4 }), { transcript, yesMin: 0.6 }).value.decision, 'unsure');
  assert.equal(validateDecision(parse({ ...just, confidence: 0.7 }), { transcript, yesMin: 0.6 }).value.decision, 'yes');
});

test('malformed model output degrades instead of failing', () => {
  const out = judgeSchema.parse({ decision: 'maybe?', confidence: 'high', positives: [{ nope: 1 }], frictions: 'none' });
  assert.equal(out.decision, 'unsure');
  assert.equal(out.confidence, 0);
  assert.deepEqual(out.positives, []);
});

// --- settle / decide / compaction on a real (in-memory) DB
let A; let B; let match; let conv;
before(start);
after(stop);
beforeEach(async () => {
  await Promise.all([Match, Conversation, MatchDecision, Message, ChatEvent, KgFact, Job].map((M) => M.deleteMany({})));
  [A, B] = [oid(), oid()].map(String).sort();
  match = await Match.create({ users: [A, B], pairKey: `${A}_${B}`, status: 'evaluating', perUser: [{ userId: A, name: 'Asha', agentActive: true }, { userId: B, name: 'Kabir', agentActive: true }] });
  conv = await Conversation.create({ matchId: match._id, seed: 1, status: 'ended' });
  for (let i = 0; i < 4; i++) await Message.create({ matchId: match._id, conversationId: conv._id, senderId: i % 2 ? B : A, authoredBy: 'agent', text: `message ${i}` });
});
const decision = (userId, d, extra = {}) => MatchDecision.create({ conversationId: conv._id, matchId: match._id, userId, otherUserId: userId === A ? B : A, decision: d, confidence: 0.8, summaryForUser: `${d} for ${userId}`, ...extra });
const status = async () => (await Match.findById(match._id).lean()).status;

test('settle waits for both sides; mutual yes → compatible; both continue → handed_off + reveal', async () => {
  await decision(A, 'yes');
  assert.equal(await settle(match._id, conv._id), null);
  await decision(B, 'yes');
  assert.equal(await settle(match._id, conv._id), 'compatible');
  assert.equal(await settle(match._id, conv._id), null, 'settles once');
  await decide(match._id, A, 'continue');
  assert.equal(await status(), 'compatible');
  await decide(match._id, B, 'continue');
  assert.equal(await status(), 'handed_off');
  const reveal = await revealFor(await Match.findById(match._id));
  assert.match(reveal.text, /first 4 messages were handled by your agents/);
});

test('the lower side wins; each user sees only their own report', async () => {
  await decision(A, 'yes');
  await decision(B, 'unsure');
  assert.equal(await settle(match._id, conv._id), 'maybe');
  assert.equal((await reportFor(match._id, A)).verdict, 'compatible');
  assert.equal((await reportFor(match._id, B)).summary, `unsure for ${B}`);
});

test('"no" with an active agent → one wind-down from that side, closed, compaction queued; "Talk anyway" only for the "no" side', async () => {
  await decision(A, 'no');
  await decision(B, 'yes');
  assert.equal(await settle(match._id, conv._id), 'incompatible');
  assert.equal(await status(), 'closed');
  const sent = await Message.find({ matchId: match._id }).sort({ createdAt: -1 }).lean();
  assert.equal(sent.length, 5);
  assert.equal(String(sent[0].senderId), A);
  assert.ok(await Job.exists({ type: 'compactNotes', dedupeKey: `compact:${match._id}` }));
  await assert.rejects(decide(match._id, B, 'continue'), (e) => e.status === 409);
  await decide(match._id, A, 'continue');
  assert.equal(await status(), 'maybe');
});

test('"no" side took over → nothing sent, status incompatible', async () => {
  await Match.updateOne({ _id: match._id, 'perUser.userId': A }, { $set: { 'perUser.$.agentActive': false } });
  await decision(A, 'no');
  await decision(B, 'yes');
  await settle(match._id, conv._id);
  assert.equal(await status(), 'incompatible');
  assert.equal(await Message.countDocuments({ matchId: match._id }), 4);
});

test('compactNotes archives a closed match (summary kept on the decision); a handed-off match keeps its notes', async () => {
  await decision(A, 'no', { notesSummary: 'already summarised' });
  await decision(B, 'yes', { notesSummary: 'already summarised' });
  await KgFact.create({ subjectId: B, observerId: A, matchId: match._id, conversationId: conv._id, predicate: 'likes', object: 'trekking', source: 'agent_observed', disclosure: 'private' });
  await ChatEvent.create({ conversationId: conv._id, matchId: match._id, observerId: A, type: 'warmth' });

  await Match.updateOne({ _id: match._id }, { $set: { status: 'handed_off' } });
  assert.deepEqual(await compactNotes({ matchId: match._id }), { skipped: 'handed_off' });
  assert.equal(await KgFact.countDocuments({ archiveAt: { $ne: null } }), 0);

  await Match.updateOne({ _id: match._id }, { $set: { status: 'closed' } });
  const r = await compactNotes({ matchId: match._id });
  assert.deepEqual([r.notes, r.events, r.messages], [1, 1, 4]);
  const at = (await ChatEvent.findOne().lean()).archiveAt;
  assert.ok(at > Date.now() + 29 * 86_400_000);
});

test('"Let them talk a bit longer": only my own unsure, once; round 2 ends after EXTEND_TURNS and its verdict replaces the old one', async () => {
  await decision(A, 'yes');
  await decision(B, 'unsure');
  await settle(match._id, conv._id);
  await assert.rejects(extend(match._id, A), (e) => e.code === 'CANNOT_EXTEND', 'my verdict is yes');
  await extend(match._id, B);
  cancelReplies(match._id); // no agent turns in this test
  assert.equal(await status(), 'agent_chatting');
  const round2 = await Conversation.findOne({ matchId: match._id, round: 2 }).lean();
  assert.deepEqual([round2.status, round2.endAfter, round2.naturalEndFrom], ['active', 12, 12]);
  await assert.rejects(extend(match._id, B), (e) => e.status === 409, 'once per match');

  // Round 2's limits reach planAct: no natural end before endAfter, max_turns at it.
  const plan = (msgCount) => planAct({ state: {}, rng: () => 0.5, msgCount, agendaSettled: true, maxMessages: round2.endAfter, naturalEndFrom: round2.naturalEndFrom }).end;
  assert.deepEqual([plan(8), plan(11)], [null, 'max_turns']);

  assert.ok(await stopConversation(match._id, 'max_turns'));
  await startEvaluation(match); // what the queued 'evaluate' job runs
  assert.ok(await Job.exists({ type: 'judge', dedupeKey: `judge:${round2._id}:${B}` }), 'judges re-run on round 2');
  for (const [u, d] of [[A, 'yes'], [B, 'yes']]) await MatchDecision.create({ conversationId: round2._id, matchId: match._id, userId: u, otherUserId: u === A ? B : A, decision: d, confidence: 0.8, summaryForUser: 'round 2' });
  assert.equal(await settle(match._id, round2._id), 'compatible');
  assert.equal((await reportFor(match._id, B)).verdict, 'compatible');
  assert.equal(await MatchDecision.countDocuments({ matchId: match._id, userId: B }), 2, 'history kept');
});
