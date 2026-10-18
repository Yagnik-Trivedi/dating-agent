// Owner's step 2: "ask my human" is structural — question to me → topic (dictionary only) → any fact? — with the hedge
// regex as fallback, dedupe per topic and a cap per conversation. Deterministic: no LLM (a stub dictionary + a test DB).
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { InboxItem } from '../src/models/InboxItem.js';
import { fileQuestion } from '../src/services/agent/askMyHuman.js';
import { createConcept, lookupConcept, resetConceptCache } from '../src/services/kg/canonicalize.js';
import { inboxDecision, knowsTopic, questionToMe, topicOf } from '../src/services/persona/askedAboutMe.js';
import { groundingCheck, hedgeSentences } from '../src/services/persona/checks.js';
import { start, stop } from '../scripts/lib/testDb.js';

const CRICKET = { id: 'c-cricket', label: 'cricket' };
const dict = { cricket: CRICKET, ipl: CRICKET, trekking: { id: 'c-trek', label: 'trekking' } };
const lookup = async (t) => dict[t] ?? null;
const meera = [{ predicate: 'likes', object: 'trekking', conceptId: 'c-trek', polarity: 1 }, { predicate: 'lifestyle', attribute: 'smoking', object: 'smoking: never' }];

async function decide(text, facts, reply = '') {
  const question = questionToMe(text);
  const topic = question ? await topicOf(question, lookup) : null;
  const known = topic ? knowsTopic(topic, facts) : null;
  return inboxDecision({ question, topic, known, hedged: hedgeSentences(reply).length > 0 });
}

test('IPL with no cricket fact → inbox item on the cricket topic', async () => {
  const d = await decide("random question but what's your favourite IPL team?", meera, "haha i'd say rcb");
  assert.deepEqual([d?.topicKey, d?.topicLabel], ['concept:c-cricket', 'cricket']);
});

test('IPL with a "dislikes cricket" fact → no inbox; the honest dislike is grounded', async () => {
  const facts = [...meera, { _id: 'f9', predicate: 'dislikes', object: 'cricket', conceptId: 'c-cricket', polarity: -1 }];
  assert.equal(await decide("what's your favourite IPL team?", facts), null);
  const g = groundingCheck({ text: "honestly not into cricket at all haha", claims: [{ text: 'not into cricket at all', factIds: ['F1'], stance: 'negative' }], facts: new Map([['F1', facts.at(-1)]]), answering: true });
  assert.deepEqual(g.problems, []);
});

test('a Hinglish question "tera favourite IPL team kaunsa hai?" → inbox', async () => {
  assert.ok(questionToMe('tera favourite IPL team kaunsa hai?'));
  assert.equal((await decide('tera favourite IPL team kaunsa hai?', meera))?.topicKey, 'concept:c-cricket');
  assert.equal((await decide('aur tu smoke karta hai kya', meera)), null, 'smoking is a known attribute');
});

test('questions about someone else are not about me; unresolved topics fall back to the hedge detector', async () => {
  assert.equal(questionToMe('does your brother like IPL? he does right'), 'does your brother like IPL?');
  assert.equal(questionToMe('my friend loves IPL. does she watch it?'), null);
  assert.equal(await decide('what do you do on weekends?', meera, 'mostly trekking!'), null);
  assert.ok((await decide('what music are you into lately?', meera, 'pata nahi, kuch bhi sunti hoon'))?.question);
});

test('a confident uncited answer → a grounding problem (regeneration) AND an inbox item', async () => {
  const g = groundingCheck({ text: 'haha cheering for rcb! do you smoke?', facts: new Map(), answering: true });
  assert.ok(g.problems.length && g.unsupported.some((c) => /rcb/i.test(c)), JSON.stringify(g));
  assert.equal(groundingCheck({ text: 'haha cheering for rcb! do you smoke?', facts: new Map() }).problems.length, 0, 'not answering: no claim');
  assert.equal((await decide("what's your favourite IPL team?", meera, 'cheering for rcb!'))?.topicKey, 'concept:c-cricket');
});

before(start);
after(stop);
beforeEach(async () => { await InboxItem.deleteMany({}); });
const noEmit = () => {};

test('dictionary-only lookup: aliases hit, unknown words never create a concept', async () => {
  resetConceptCache();
  await createConcept({ name: 'cricket', label: 'cricket', type: 'activity', aliases: ['ipl'] });
  assert.equal((await lookupConcept('IPL'))?.label, 'cricket');
  assert.equal(await lookupConcept('underwater basket weaving'), null);
  assert.equal(await mongoose.connection.db.collection('concepts').countDocuments(), 1);
});

test('a repeated question on the same topic merges into the open item ("asked again by …")', async () => {
  const user = new mongoose.Types.ObjectId(), m1 = new mongoose.Types.ObjectId(), m2 = new mongoose.Types.ObjectId();
  const item = { question: "what's your favourite IPL team?", topicKey: 'concept:c-cricket', topicLabel: 'cricket' };
  assert.equal((await fileQuestion(user, m1, item, { askedBy: 'Rohan', emit: noEmit })).action, 'created');
  const again = await fileQuestion(user, m2, { ...item, question: 'tera favourite IPL team kaunsa hai?' }, { askedBy: 'Dev', emit: noEmit });
  assert.equal(again.action, 'merged');
  assert.equal(await InboxItem.countDocuments({ userId: user }), 1);
  assert.deepEqual(again.item.askedAgain.map((a) => a.by), ['Dev']);
});

test('at most 3 new items per conversation', async () => {
  const user = new mongoose.Types.ObjectId(), m = new mongoose.Types.ObjectId();
  const actions = [];
  for (const k of ['a', 'b', 'c', 'd']) actions.push((await fileQuestion(user, m, { question: `q ${k}?`, topicKey: `concept:${k}`, topicLabel: k }, { emit: noEmit })).action);
  assert.deepEqual(actions, ['created', 'created', 'created', 'capped']);
});

test('"what are you hoping to find on here?" asks about looking_for', async () => {
  assert.equal((await topicOf('what are you hoping to find on here?', lookup))?.key, 'looking_for');
});
