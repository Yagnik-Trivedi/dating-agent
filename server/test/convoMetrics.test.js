// Plan 31 A10: the eval metrics separate the interview pattern (eval c2, S1 run) from casual chat (plan 31 A1).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convoMetrics, parseTranscript } from '../scripts/eval/lib/convoMetrics.js';

const chat = (pairs) => pairs.map(([speaker, text]) => ({ speaker, text, agent: true }));
const interview = chat([
  ['R', 'haha glad we agree on the coffee! what are you looking for on here?'],
  ['A', 'looking for something real, long term. how about you, kids someday?'],
  ['R', 'im also looking for long term yeah. kids?'],
  ['A', 'yeah kids someday, hope that is cool. do you smoke?'],
  ['R', 'nah i never smoke haha how about you?'],
  ['A', 'never, and i only drink socially'],
  ['R', 'nice. so you do want kids?'],
]);
const casual = chat([
  ['B', 'heyy how is your day going'],
  ['A', 'tiring lol, back to back classes. yours?'],
  ['B', 'same honestly, just got home'],
  ['A', 'ugh. at least it is friday'],
  ['B', 'true 😂 any plans for the weekend?'],
  ['A', 'probably just sleeping tbh. maybe a movie'],
]);

test('the interview chat: matching questions, re-asks and back-to-back questions; casual chat: none', () => {
  const i = convoMetrics(interview, { settled: ['smoking'] });
  assert.ok(i.matching >= 4, `matching ${i.matching}`);
  assert.equal(i.matchingAboutSettled, 2, 'smoking was settled by the gate ("do you smoke?" and "never smoke… how about you?")');
  assert.equal(i.matchingReasked, 1, '"so you do want kids?" after he said "yeah kids someday"');
  assert.equal(i.questions, 6);
  const c = convoMetrics(casual, { settled: [] });
  assert.deepEqual([c.matching, c.matchingAboutSettled, c.backToBack, c.topicChangesWhileTelling], [0, 0, 0, 0]);
  assert.ok(c.questions <= 2);
});

test('parseTranscript reads the saved eval transcript format', () => {
  const md = '# c2\n\n## Transcript\n\n1. **Riya** (agent): hey!!\n2. **Aditya** (human): hi, how are you?\n\n## Trust\n- ok';
  assert.deepEqual(parseTranscript(md), [{ speaker: 'Riya', agent: true, text: 'hey!!' }, { speaker: 'Aditya', agent: false, text: 'hi, how are you?' }]);
});
