// Plan 31 A4 + A3 step 6: the read's mood / energy / doing (old moods as aliases, safe defaults); an askOnce item they
// answered (verbatim quote) becomes known (chat); a dealbreaker hint reopens a gate-settled item for one follow-up.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { Match } from '../src/models/Match.js';
import { moodOf, observe, perceiveSchema } from '../src/services/conversation/perceive.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

test('mood, energy and doing: the new lists, old values as aliases, defaults when missing or odd', () => {
  const empty = perceiveSchema.parse({});
  assert.deepEqual([empty.mood, empty.energy, empty.doing], ['chill', 'medium', 'chatting']);
  const read = perceiveSchema.parse({ mood: 'tease', energy: 'LOW', doing: 'venting' });
  assert.deepEqual([read.mood, read.energy, read.doing], ['playful', 'low', 'venting']);
  assert.deepEqual([moodOf('closing'), moodOf('excited'), moodOf('???')], ['tired', 'excited', 'chill']);
  assert.equal(perceiveSchema.parse({ doing: 'ranting' }).doing, 'chatting');
});

test('an askOnce item they answered becomes known (chat); a hint reopens a gate-settled dealbreaker for one follow-up', async () => {
  const me = new mongoose.Types.ObjectId();
  const them = new mongoose.Types.ObjectId();
  const agenda = [
    { id: 'a1', topic: 'living in 3-5 years', attribute: 'location', priority: 0.9, status: 'open', askOnce: true },
    { id: 'a2', topic: 'smoking', attribute: 'smoking', dealbreaker: true, priority: 1, status: 'answered', settledBy: 'gate' },
  ];
  const match = await Match.create({ users: [me, them], pairKey: `${me}_${them}`, status: 'agent_chatting', perUser: [{ userId: me, name: 'Arya' }, { userId: them, name: 'Kabir' }], brief: { [me]: { agenda } } });
  const persona = { userId: me, firstName: 'Arya', facts: [{ attribute: 'smoking', value: 'never', importance: 1 }], voice: {}, gate: { dealbreakers: ['smoking'], accepts: { smoking: ['never'] } } };
  const theirMsgs = [{ _id: new mongoose.Types.ObjectId(), text: 'honestly i want to settle in pune long term. i smoke sometimes at parties tbh' }];
  const out = perceiveSchema.parse({
    agendaHits: [{ id: 'a1', quote: 'i want to settle in pune long term' }],
    claims: [{ text: 'i smoke sometimes at parties', attribute: 'smoking', value: 'socially' }], dealbreakerHint: 'smoking',
  });
  const { agenda: updated } = await observe(out, { match, conv: { _id: new mongoose.Types.ObjectId() }, persona, otherId: them, theirMsgs, myLast: null, agenda, turn: 3 });
  const [loc, smoke] = updated;
  assert.deepEqual([loc.status, loc.settledBy], ['answered', 'chat']);
  assert.deepEqual([smoke.status, smoke.settledBy, smoke.reopened, smoke.askOnce], ['open', undefined, true, true]);
  assert.deepEqual((await Match.findById(match._id).lean()).brief[me].agenda, updated);
  // A quote they never wrote is not a hit.
  const fake = perceiveSchema.parse({ agendaHits: [{ id: 'a1', quote: 'i will move abroad' }] });
  const again = await observe(fake, { match, conv: { _id: new mongoose.Types.ObjectId() }, persona, otherId: them, theirMsgs, myLast: null, agenda, turn: 4 });
  assert.equal(again.agenda[0].status, 'open');
});
