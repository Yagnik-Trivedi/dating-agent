// Plan 08 §3 / plan 15 stage 7: learning from my own side. No LLM: the rule step is covered by addRule; the rest is DB.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { VoiceSample } from '../src/models/VoiceSample.js';
import { addRule, learnOwnMessage } from '../src/services/kg/ownVoice.js';
import { styleCheck } from '../src/services/persona/checks.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

test('a never_say rule stores the literal phrase, which the style check then catches', () => {
  const profile = { corrections: [], neverSay: [] };
  addRule(profile, { rule: "Never say 'dude'", kind: 'never_say', phrase: 'dude' }, 'wouldnt_say');
  addRule(profile, { rule: 'Keep replies short', kind: 'style' }, 'wouldnt_say');
  addRule(profile, { rule: 'Avoid slang', kind: 'never_say' }, 'graph_edit'); // no phrase → correction only
  assert.deepEqual(profile.neverSay, ['dude']);
  assert.deepEqual(profile.corrections.map((c) => [c.kind, c.from]), [['never_say', 'wouldnt_say'], ['style', 'wouldnt_say'], ['never_say', 'graph_edit']]);
  const problems = styleCheck('haha nice one dude', { targetWords: 8 }, profile, []);
  assert.ok(problems.some((p) => p.includes('"dude"')), problems.join('; '));
});

test('after handoff my own typed messages become own_chat samples, unless learnFromChats is off', async () => {
  const [me, them] = await User.create([
    { email: 'a@t.local', passwordHash: 'x', name: 'A', consentAgent: true, consentAt: new Date() },
    { email: 'b@t.local', passwordHash: 'x', name: 'B', consentAgent: true, consentAt: new Date() },
  ]);
  const matchId = new mongoose.Types.ObjectId();
  await Message.create({ matchId, senderId: them._id, authoredBy: 'human', text: 'so what are you doing this weekend?' });
  const mine = await Message.create({ matchId, senderId: me._id, authoredBy: 'human', text: 'prob trekking at rajmachi haha' });

  assert.equal(await learnOwnMessage(mine, { status: 'agent_chatting' }), false, 'before handoff: nothing');
  assert.equal(await learnOwnMessage({ ...mine.toObject(), authoredBy: 'agent' }, { status: 'handed_off' }), false, 'agent messages: nothing');
  assert.equal(await learnOwnMessage(mine, { status: 'handed_off' }), true);
  const s = await VoiceSample.findOne({ userId: me._id }).lean();
  assert.deepEqual([s.source, s.incoming, s.text], ['own_chat', 'so what are you doing this weekend?', 'prob trekking at rajmachi haha']);

  await User.updateOne({ _id: me._id }, { $set: { 'settings.learnFromChats': false } });
  assert.equal(await learnOwnMessage(mine, { status: 'handed_off' }), false, 'setting off: nothing');
  assert.equal(await VoiceSample.countDocuments({ userId: me._id }), 1);
});
