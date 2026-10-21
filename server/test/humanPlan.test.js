// Plan 31 A5/A6, CONVO_MODE=human: planAct for simple, mood-matched talk. Each test guards one problem from plan 31
// section 0.1 (P2–P6) so it can't come back; CONVO_MODE=sn must replay plan 30 SN exactly (frozen fixture).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { planAct, readHeuristics } from '../src/services/conversation/planAct.js';
import { KG } from '../src/services/kg/config.js';
import { rng } from '../src/utils/rng.js';
import { runScenarios } from './fixtures/snScenarios.js';

const voice = { wordCounts: [8, 10, 12, 14], burstiness: 0.3, questionBackRate: 0.6, emojiPerMessage: 0.3, topEmojis: ['😄'], laughRate: 0.5, laughForms: { haha: 1 }, language: { mix: { en: 1 } } };
const location = { id: 'a1', topic: 'living in 3-5 years', attribute: 'location', priority: 0.9, status: 'open', askOnce: true };
const known = { id: 'a2', topic: 'wants children', attribute: 'kids', priority: 0.9, status: 'answered', settledBy: 'profile' };
const forYou = { id: 'a3', topic: 'looking for', attribute: 'looking_for', priority: 0.9, status: 'for_you' };
const stories = [{ _id: 's1', object: 'got lost on the Rajmachi trek with my cousins' }];
const human = (o) => planAct({ mode: 'human', voice, rng: rng(o.seed ?? 1), agenda: [location, known, forYou], stories, msgCount: 6, ...o, state: { interest: 0.6, turn: 4, warm: true, ...o.state } });
const near = 'i might move abroad for my masters next year';
const many = (o, n = 200) => Array.from({ length: n }, (_, i) => human({ ...o, seed: i + 1 }));

test('CONVO_MODE=sn replays plan 30 SN exactly (same seeds, same plans as before plan 31)', () => {
  const frozen = JSON.parse(readFileSync(new URL('./fixtures/sn-plans.json', import.meta.url)));
  assert.deepEqual(JSON.parse(JSON.stringify(runScenarios(planAct, { mode: 'sn' }))), frozen);
  assert.deepEqual(JSON.parse(JSON.stringify(runScenarios(planAct))), frozen, 'no mode = sn');
});

test('P2: the one matching question comes only from an askOnce item, when warm and near it; never twice; never known/for-you', () => {
  const p = human({ thread: { theirs: near } });
  assert.deepEqual([p.topic?.id, p.topic?.how, p.askBack], ['a1', 'ask_once', true]);
  assert.equal(human({ thread: { theirs: 'haha that sounds fun' } }).topic, null, 'not near the topic: never cold');
  assert.equal(human({ thread: { theirs: near }, state: { warm: false } }).topic, null, 'the chat is not warm yet');
  assert.equal(human({ thread: { theirs: near }, state: { matchingQuestions: KG.MAX_MATCHING_QUESTIONS } }).topic, null, 'one per chat');
  assert.equal(human({ thread: { theirs: near }, state: { topicTries: { a1: 1 } } }).topic, null, 'never repeated');
  assert.equal(human({ thread: { theirs: near }, state: { heardAttrs: ['location'] } }).topic, null, 'they already said it');
  for (const theirs of ['my nephew is so cute, want kids someday?', 'what are you looking for on here?']) {
    for (const p2 of many({ thread: { theirs } }, 50)) assert.ok(!p2.topic || p2.topic.kind !== 'agenda', 'known and for-you items are never planned');
  }
  // A reopened dealbreaker (a hint in chat) may be followed up once even after the matching question was used.
  const reopened = { id: 'a4', topic: 'smoking', attribute: 'smoking', dealbreaker: true, priority: 1, status: 'open', askOnce: true, reopened: true };
  assert.equal(human({ agenda: [reopened], thread: { theirs: 'my flatmate smokes on the balcony lol' }, state: { matchingQuestions: 1 } }).topic?.id, 'a4');
});

test('P4: while they are telling something or venting, the agent stays on it (no topic, no story)', () => {
  const venting = 'honestly my manager yelled at me today in front of everyone and i just sat there, worst day, i might move abroad';
  for (const p of many({ thread: { theirs: venting } }, 50)) {
    assert.equal(p.move, 'stay');
    assert.equal(p.topic, null);
    assert.equal(p.read.doing, 'venting');
  }
  const telling = 'so basically we reached the top at 4am and then the fog rolled in and we could not see anything at all for an hour';
  assert.equal(human({ thread: { theirs: telling } }).move, 'stay');
});

test('P3: no question right after my own question unless they asked me; most messages have no question', () => {
  for (const p of many({ thread: { theirs: 'haha yeah it was fun' }, state: { lastAsked: true } })) assert.equal(p.askBack, false);
  // A10: question rate per chat ≤ 0.35, replaying 12-turn chats with state carried forward (a talkative voice).
  const lines = ['haha yeah it was such a fun weekend honestly', 'same, the weather was perfect', 'ha true, i love that place', 'oh nice, i went there last year too'];
  let asked = 0, total = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const r = rng(seed);
    let lastAsked = false;
    for (let turn = 0; turn < 12; turn++) {
      const p = planAct({ mode: 'human', voice, rng: r, agenda: [], msgCount: turn, thread: { theirs: lines[turn % lines.length] }, state: { interest: 0.6, turn, lastAsked } });
      lastAsked = p.askBack;
      asked += p.askBack ? 1 : 0;
      total++;
    }
  }
  assert.ok(asked / total <= 0.35, `question rate ${asked / total}`);
  assert.equal(human({ thread: { theirs: 'what do you do on weekends?' }, perception: { aboutMeQuestion: true }, state: { lastAsked: true } }).move, 'reply');
});

test('P5: the reply length is pulled toward theirs; tired or busy → fewer questions and a gentle close after the minimum', () => {
  const avg = (theirs) => many({ thread: { theirs } }).reduce((s, p) => s + p.targetWords, 0) / 200;
  const short = avg('lol ok');
  const long = avg('we went to that new cafe near fc road and the coffee was honestly so good, then we walked around for hours');
  assert.ok(short < 7 && long > short * 2, `short ${short} vs long ${long}`);
  const tired = many({ thread: { theirs: 'ugh so tired today' } }).filter((p) => p.askBack).length;
  const fresh = many({ thread: { theirs: 'that sounds like a fun plan' } }).filter((p) => p.askBack).length;
  assert.ok(tired < fresh / 2, `tired ${tired} vs fresh ${fresh}`);
  const closing = human({ thread: { theirs: 'okay i should sleep, long day tomorrow' }, msgCount: KG.NATURAL_END_FROM, agendaSettled: true });
  assert.deepEqual([closing.end, closing.move], ['natural', 'close']);
  assert.equal(human({ thread: { theirs: 'okay i should sleep' }, msgCount: KG.NATURAL_END_FROM - 2, agendaSettled: true }).end, null, 'not before the minimum');
});

test('P6: no unprompted stories; one only after they told one and it connects', () => {
  for (const p of many({ thread: { theirs: 'we did the rajmachi trek last weekend' } }, 100)) assert.notEqual(p.topic?.kind, 'story', 'they did not tell one first');
  const after = human({ thread: { theirs: 'haha anyway that was my rajmachi trek disaster' }, state: { theyTold: true } });
  assert.equal(after.topic?.kind, 'story');
  assert.equal(human({ thread: { theirs: 'haha anyway that was my day' }, state: { theyTold: true } }).topic, null, 'nothing of mine connects');
});

test('readHeuristics: tired, venting, news, telling, busy and closing from the words alone', () => {
  assert.deepEqual(readHeuristics('ugh so tired'), { mood: 'tired', energy: 'low' });
  assert.equal(readHeuristics('worst day, my manager yelled at me').doing, 'venting');
  assert.deepEqual(readHeuristics('I GOT INTO THE PROGRAM!!'), { mood: 'excited', energy: 'high', doing: 'sharing_news' });
  assert.equal(readHeuristics('so basically my cousin turned up at 6am').doing, 'telling');
  assert.equal(readHeuristics('sorry, super busy today').doing, 'winding_down');
  assert.equal(readHeuristics('lol ok').energy, 'low');
  assert.deepEqual(readHeuristics('LOL that is so true'), {}, 'an acronym is not shouting');
});
