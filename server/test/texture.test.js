// Plan 33 C1 (A6): natural texture. The user's own fillers at about their own rate, never one they don't use; weak or
// uncertain facts hedged; "think" and "not sure" moves when answering. No LLM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { textureRecord } from '../src/services/conversation/engine.js';
import { computeVoiceProfile } from '../src/services/kg/voiceProfile.js';
import { fillerRates, fillersIn, hedgeRate, isHedged, planTexture, stripForeign } from '../src/services/persona/texture.js';
import * as agentReply from '../src/services/prompts/agentReply.js';
import { rng } from '../src/utils/rng.js';

const replies = ['haha yes!! that place is the best', 'hmm idk, maybe the mountains?', 'i think so haha', 'omg congrats!!', 'haha ok fine', 'tbh i love that'];

test('fillers and their rates come from my own replies; the voice profile stores them', () => {
  assert.deepEqual(fillerRates(replies.map((text) => ({ text }))), { hmm: 0.17, idk: 0.17, tbh: 0.17, 'i think': 0.17 });
  assert.equal(hedgeRate(replies.map((text) => ({ text }))), 0.33);
  const v = computeVoiceProfile(replies.map((text) => ({ text })));
  assert.deepEqual(Object.keys(v.fillers).sort(), ['hmm', 'i think', 'idk', 'tbh']);
  assert.equal(v.hedgeRate, 0.33);
});

test('a user who never writes "lol" (or "idk") never gets it; their own forms stay', () => {
  const voice = { laughForms: { haha: 0.8, lol: 0, lmao: 0 } };
  assert.equal(stripForeign('lol that is so true', { fillers: [], voice }).text, 'that is so true');
  assert.equal(stripForeign('haha that is so true', { fillers: [], voice }).text, 'haha that is so true');
  assert.equal(stripForeign('idk, maybe the mountains? tbh beaches too', { fillers: ['tbh'], voice }).text, 'maybe the mountains? tbh beaches too');
  assert.equal(stripForeign('Wait, you went to Spiti?', { fillers: [], voice }).text, 'you went to Spiti?');
  assert.equal(stripForeign('I can wait for it, are you coming?', { fillers: [], voice }).text, 'I can wait for it, are you coming?', 'ordinary words stay');
  assert.equal(stripForeign('i think the mountains', { fillers: [], voice }).text, 'i think the mountains', '"i think" is ordinary language');
  assert.deepEqual(stripForeign('arre yaar that is wild lol', { fillers: [], voice }).stripped, ['arre', 'yaar', 'lol']);
});

test('the planned filler is one of mine, at about my rate; unknown → not_sure; loosely held → think', () => {
  const voice = { fillers: { hmm: 0.2, idk: 0.1 }, hedgeRate: 0.4 };
  const plans = Array.from({ length: 2000 }, (_, i) => planTexture({ voice, rng: rng(i + 1) }));
  const rate = plans.filter((p) => p.filler).length / plans.length;
  assert.ok(Math.abs(rate - 0.3) < 0.04, `rate ${rate}`);
  assert.ok(plans.every((p) => !p.filler || ['hmm', 'idk'].includes(p.filler)));
  assert.equal(planTexture({ voice: { fillers: {} }, rng: rng(1) }).filler, null, 'no fillers of my own → none');
  assert.equal(planTexture({ voice, rng: rng(1), answering: true, unknown: true }).move, 'not_sure');
  assert.equal(planTexture({ voice, rng: rng(1), answering: true, loose: true }).move, 'think');
  assert.equal(planTexture({ voice, rng: rng(1) }).move, null, 'not answering: no move change');
  const older = planTexture({ samples: replies.map((text) => ({ text })), rng: rng(3) });
  assert.deepEqual(older.fillers.sort(), ['hmm', 'i think', 'idk', 'tbh'], 'a profile from before plan 33 reads its samples');
});

test('weak or uncertain facts are marked and hedged; the record counts it', () => {
  assert.equal(isHedged({ predicate: 'likes', strength: 0.3 }), true);
  assert.equal(isHedged({ predicate: 'likes', strength: 0.9 }), false);
  assert.equal(isHedged({ predicate: 'values', importance: 0.3 }), false, 'only likes and opinions have strength');
  assert.equal(isHedged({ predicate: 'opinion', uncertain: true, strength: 0.9 }), true);
  const facts = new Map([['F1', { predicate: 'likes', object: 'astrology', strength: 0.3 }], ['F2', { predicate: 'likes', object: 'trekking', strength: 0.9 }]]);
  const rec = textureRecord({
    messages: ['i think astrology is kinda fun.', 'I love trekking though! hmm'],
    claims: [{ text: 'astrology is kinda fun', factIds: ['F1'] }, { text: 'I love trekking', factIds: ['F2'] }], facts, filler: 'hmm',
  });
  assert.deepEqual(rec.hedge, { loose: 1, hedged: 1 });
  assert.deepEqual(rec.used, ['hmm', 'i think', 'kinda']);
  assert.equal(rec.over, true, 'three fillers when one was planned: recorded, not regenerated');
  assert.deepEqual(fillersIn('haha ok'), ['haha']);
});

test('the prompt names my fillers, the hedge rule and the think move', () => {
  const plan = { mode: 'human', move: 'think', targetWords: 10, reactions: [], language: { primary: 'en' }, read: {}, texture: { filler: 'hmm', fillers: ['hmm', 'idk'] } };
  const [sys, user] = agentReply.build({ firstName: 'Meera', matchName: 'Ishaan', style: '', exemplars: [], myFacts: ['[F1] likes: astrology [not sure]'], guidance: [], tone: [], aboutThem: [], transcript: [], plan });
  assert.match(sys.content, /Meera's own filler words: "hmm", "idk"\. One "hmm" fits this message/);
  assert.match(sys.content, /Never a filler or laugh Meera doesn't use/);
  assert.match(sys.content, /\[not sure\] are things Meera only half-likes[\s\S]*hedge/);
  assert.match(sys.content, /think out loud/);
  assert.match(user.content, /think out loud for a second/);
  const none = agentReply.build({ firstName: 'Meera', matchName: 'Ishaan', style: '', exemplars: [], myFacts: [], guidance: [], tone: [], aboutThem: [], transcript: [], plan: { ...plan, move: 'react', texture: { filler: null, fillers: [] } } });
  assert.match(none[0].content, /Meera doesn't use filler words/);
  assert.doesNotMatch(none[0].content, /\[not sure\] are things/);
});
