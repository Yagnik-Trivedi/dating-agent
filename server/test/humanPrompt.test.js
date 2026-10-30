// Plan 31 B3 (agentReply / agentTurn, CONVO_MODE=human): the casual-chat block replaces SN's, small talk needs no fact
// (P1), the move and mood lines, a plain askOnce line with no setup (P2/P6); known, for-you and removed items never
// reach the model, in the reply or in the read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { perceiveArgs } from '../src/services/conversation/perceive.js';
import { planAct } from '../src/services/conversation/planAct.js';
import * as agentReply from '../src/services/prompts/agentReply.js';
import * as agentTurn from '../src/services/prompts/agentTurn.js';
import { rng } from '../src/utils/rng.js';

const agenda = [
  { id: 'a1', topic: 'living in 3-5 years', attribute: 'location', priority: 0.9, status: 'open', askOnce: true },
  { id: 'a2', topic: 'wants children', attribute: 'kids', priority: 0.9, status: 'answered', settledBy: 'profile' },
  { id: 'a3', topic: 'looking for', attribute: 'looking_for', priority: 0.9, status: 'for_you' },
  { id: 'a4', topic: 'smoking', attribute: 'smoking', dealbreaker: true, priority: 1, status: 'answered', settledBy: 'gate' },
];
const voice = { wordCounts: [8, 10], questionBackRate: 0.4, language: { mix: { en: 1 } } };
const reply = (plan) => ({ firstName: 'Arya', matchName: 'Kabir', style: 'casual', exemplars: [], myFacts: ['[F1] likes: trekking'], guidance: [], tone: [], aboutThem: [], transcript: ['Kabir: i might move abroad for my masters'], plan });
const text = (msgs) => msgs.map((m) => m.content).join('\n');

test('P1: the chat block keeps it light and short, a plain reaction needs no fact; SN block gone', () => {
  const plan = planAct({ mode: 'human', voice, rng: rng(1), agenda, state: { interest: 0.6, turn: 3, warm: true }, thread: { theirs: 'ugh so tired, back to back classes' }, msgCount: 4 });
  const p = text(agentReply.build(reply(plan)));
  assert.match(p, /Keep it light and human, like a real text/);
  assert.match(p, /Short messages, sometimes two in a row/);
  assert.match(p, /A plain reaction with no claim needs neither/);
  assert.match(p, /They seem tired \(low energy\): very short and warm/);
  assert.doesNotMatch(p, /HOW A GOOD CHAT FEELS|Share before you ask/);
});

test('P2/P6: the askOnce question is plain, one line, no setup; never "speaking of" / "random but"', () => {
  const plan = planAct({ mode: 'human', voice, rng: rng(1), agenda, state: { interest: 0.6, turn: 4, warm: true }, thread: { theirs: 'i might move abroad for my masters next year' }, msgCount: 6 });
  assert.equal(plan.topic?.how, 'ask_once');
  const p = text(agentReply.build(reply(plan)));
  assert.match(p, /ask this plainly in one short casual line: "where do you see yourself living in a few years\?" No setup, no story, no hint first/);
  assert.doesNotMatch(p, /speaking of|random but|ease into/i);
});

test('known, for-you and removed items never reach the model (reply prompt and the read in the merged turn)', () => {
  const plan = planAct({ mode: 'human', voice, rng: rng(2), agenda, state: { interest: 0.6, turn: 4, warm: true }, thread: { theirs: 'haha same' }, msgCount: 6 });
  const read = perceiveArgs({ persona: { firstName: 'Arya' }, theirMsgs: [{ text: 'haha same' }], context: { theirName: 'Kabir', lines: [] }, myLast: null, agenda });
  assert.deepEqual(read.agenda.map((a) => a.id), ['a1']);
  const p = text(agentTurn.build({ reply: reply(plan), read }));
  for (const hidden of ['wants children', 'looking for', 'smoking']) assert.ok(!p.includes(`] ${hidden}`), `${hidden} shown to the model`);
});
