// Plan 31 B3 (engine, CONVO_MODE=human): each new draft problem is reported (→ the one regeneration) and its sentences
// are dropped if the regeneration doesn't fix them. A clean casual reply has none.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { humanProblems } from '../src/services/conversation/engine.js';

const facts = new Map([['F1', { _id: 'f1', predicate: 'likes', object: 'trekking' }], ['S1', { _id: 's1', predicate: 'story', object: 'got lost on the Rajmachi trek' }]]);
const draft = (text, claims = []) => ({ messages: [text], claims });
const check = (text, o = {}) => humanProblems({ text, draft: draft(text, o.claims), plan: o.plan ?? { move: 'react' }, read: o.read ?? { mood: 'chill', energy: 'medium', doing: 'chatting' }, state: o.state ?? {}, theyAsked: o.theyAsked ?? false, theirText: o.theirs ?? 'haha that weekend was fun', facts });

test('a clean, casual reply has no problems', () => {
  assert.deepEqual(check('haha same, i slept through most of it'), { problems: [], drop: [] });
  assert.deepEqual(check('wait what happened after?', { read: { doing: 'telling' }, theirs: 'so basically we reached the top and the fog rolled in' }).problems, []);
});

test('P2: a matching question the plan did not call for (known, for you, removed or a second one)', () => {
  const r = check('haha nice. do you want kids someday?');
  assert.equal(r.problems.length, 1);
  assert.deepEqual(r.drop, ['do you want kids someday?']);
  const planned = check('haha same. where do you see yourself settling in a few years?', { plan: { move: 'react', topic: { kind: 'agenda', id: 'a1', text: 'living in 3-5 years' } } });
  assert.deepEqual(planned.problems, [], 'the planned askOnce question is fine');
  assert.equal(check('do you drink?', { plan: { move: 'react', topic: { kind: 'agenda', id: 'a1', text: 'living in 3-5 years' } } }).problems.length, 1, 'a second, different one');
});

test('P4: a new topic while they are telling or venting (my thing, a matching question or my story)', () => {
  const venting = { read: { mood: 'down', doing: 'venting' }, theirs: 'my manager yelled at me in front of everyone today' };
  assert.equal(check('ugh that sucks. do you like trekking?', venting).problems.length, 1);
  assert.equal(check('that sounds awful. did he apologise at least?', venting).problems.length, 0, 'a question about THEIR thing is fine');
  const story = check('that reminds me, I got lost on the Rajmachi trek once', { ...venting, claims: [{ text: 'I got lost on the Rajmachi trek once', factIds: ['S1'] }] });
  assert.equal(story.problems.length, 1);
  assert.equal(story.drop.length, 1);
});

test('P6: a story of mine when they did not tell one or ask', () => {
  const claims = [{ text: 'I got lost on the Rajmachi trek once', factIds: ['S1'] }];
  assert.equal(check('haha I got lost on the Rajmachi trek once', { claims }).problems.length, 1);
  assert.equal(check('haha I got lost on the Rajmachi trek once', { claims, state: { theyTold: true } }).problems.length, 0, 'after they told one');
});

test('P3: my second question in a row when they did not ask me anything', () => {
  const r = check('haha nice. what are you up to tonight?', { state: { lastAsked: true } });
  assert.equal(r.problems.length, 1);
  assert.deepEqual(r.drop, ['what are you up to tonight?']);
  assert.equal(check('i love that! what about you?', { state: { lastAsked: true }, theyAsked: true }).problems.length, 0);
});

test('P5: much longer than their message when their energy is low', () => {
  const long = 'haha yeah honestly i get that, today was super long for me too with meetings and then traffic and everything else';
  assert.equal(check(long, { read: { energy: 'low' }, theirs: 'lol ok' }).problems.length, 1);
  assert.equal(check(long, { read: { energy: 'medium' }, theirs: 'lol ok' }).problems.length, 0);
  assert.equal(check('haha fair', { read: { energy: 'low' }, theirs: 'lol ok' }).problems.length, 0);
});
