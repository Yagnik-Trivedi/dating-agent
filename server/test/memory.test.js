// Plan 33 C1 (A5): memory across sessions. The last 20 messages raw (a marker where a session started), earlier
// sessions only as summaries + threads + topics covered, and a question from an earlier session is never asked again.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryFor, rawTranscript, repeatsEarlier } from '../src/services/conversation/memory.js';
import * as agentReply from '../src/services/prompts/agentReply.js';

const conv = {
  sessionIndex: 3,
  sessions: [
    { n: 1, startCount: 0, endedAt: new Date(1), summary: 'Meera and Ishaan swapped weekend plans.', threads: [{ about: 'u2', text: 'his football match on Sunday' }], topicsCovered: ['what she does for work'] },
    { n: 2, startCount: 16, endedAt: new Date(2), summary: 'They talked about treks and his sister.', threads: [{ about: 'u2', text: 'the Hampta Pass trek he is planning' }, { about: 'u1', text: 'her exam on Friday' }], topicsCovered: ['his trekking', 'what she does for work'] },
    { n: 3, startCount: 32, target: 52 },
  ],
};
const history = Array.from({ length: 40 }, (_, i) => ({ text: `message ${i + 1}`, mine: i % 2 === 0 }));

test('the transcript is the last 20 messages, with a marker where a session started; earlier ones only as summaries', () => {
  const lines = rawTranscript(history, conv, (m) => `${m.mine ? 'You' : 'Ishaan'}: ${m.text}`);
  assert.equal(lines.filter((l) => l.startsWith('You') || l.startsWith('Ishaan')).length, 20);
  assert.equal(lines[0], 'You: message 21');
  assert.equal(lines.indexOf('--- (some hours later) ---'), 12, 'session 3 started at message 33');
  assert.ok(!lines.some((l) => l.includes('message 20:') || l.endsWith('message 1')));
  const memory = memoryFor(conv, { me: 'u1', otherId: 'u2', myName: 'Meera', theirName: 'Ishaan' });
  assert.deepEqual(memory.summaries, ['Sitting 1: Meera and Ishaan swapped weekend plans.', 'Sitting 2: They talked about treks and his sister.']);
  assert.deepEqual(memory.theirThreads, ['the Hampta Pass trek he is planning']);
  assert.deepEqual(memory.covered, ['what she does for work', 'his trekking']);
  const [, user] = agentReply.build({ firstName: 'Meera', matchName: 'Ishaan', style: '', exemplars: [], myFacts: [], guidance: [], tone: [], aboutThem: [], transcript: lines, plan: { move: 'react', targetWords: 8, reactions: [], language: { primary: 'en' } }, memory });
  assert.match(user.content, /EARLIER SITTINGS[\s\S]*Sitting 2: They talked about treks[\s\S]*Already talked through \(don't ask about these again[\s\S]*CONVERSATION SO FAR:\nYou: message 21/);
  assert.equal(memoryFor({ sessionIndex: 1, sessions: [{ n: 1, startCount: 0 }] }, { me: 'u1', otherId: 'u2' }), null, 'nothing in session 1');
});

test('a question from an earlier session is a repeat; a check-in on the same thing is not', () => {
  const earlier = ['what do you do for work?', 'what kind of music do you listen to?', 'have you done the Hampta Pass trek?'];
  assert.equal(repeatsEarlier('so what do you do for work?', earlier), 'what do you do for work?');
  assert.equal(repeatsEarlier('what music are you into?', earlier), 'what kind of music do you listen to?');
  assert.equal(repeatsEarlier('wait have you done Hampta Pass?', earlier), 'have you done the Hampta Pass trek?');
  assert.equal(repeatsEarlier('how was work today?', earlier), null);
  assert.equal(repeatsEarlier('how did the trek planning go?', earlier), null);
  assert.equal(repeatsEarlier('any plans this weekend?', earlier), null);
});
