// Plan 30 S1 (speed): per-task tiers, batched concept resolution (one embed + one tie-break call), the merged
// read+reply prompt, trust "clarify" topics joining a brief built in parallel, and the phase-1 build (no model calls).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { Concept } from '../src/models/Concept.js';
import { KgFact } from '../src/models/KgFact.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { VoiceProfile } from '../src/models/VoiceProfile.js';
import { addClarify } from '../src/services/brief/buildBrief.js';
import { buildUserGraph } from '../src/services/kg/buildUserGraph.js';
import { resetConceptCache, resolveConcepts } from '../src/services/kg/canonicalize.js';
import { taskConfig } from '../src/services/llm/tasks.js';
import * as agentTurn from '../src/services/prompts/agentTurn.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

test('task tiers: fast tasks run on mid while on NVIDIA; unknown tasks keep the caller tier', () => {
  assert.equal(taskConfig('agent-stance-check', 'fast').tier, 'mid');
  assert.equal(taskConfig('icebreakers', 'fast').tier, 'mid');
  assert.equal(taskConfig('judge', 'smart').tier, 'smart');
  assert.equal(taskConfig('agent-reply', 'mid').maxTokens, 512);
  assert.deepEqual([taskConfig('onboarding-style', 'mid').timeoutMs, taskConfig('onboarding-style', 'mid').retries], [45_000, 1]);
});

test('batched concepts: exact first, then ONE embedding call and ONE tie-break call', async () => {
  resetConceptCache();
  const v = (x, y) => [x, y, 0];
  await Concept.create([
    { name: 'trekking', label: 'trekking', type: 'activity', aliases: ['hiking'], embedding: v(1, 0), embeddingModel: 'm' },
    { name: 'cooking', label: 'cooking', type: 'activity', aliases: [], embedding: v(0, 1), embeddingModel: 'm' },
  ]);
  resetConceptCache();
  // The cache only keeps vectors made with the current model: patch them in for the stub.
  const calls = { embed: 0, tie: 0 };
  const vectors = { 'mountain walk': v(0.99, 0.05), baking: v(0.5, 0.6), chess: v(-1, 0) };
  const out = await resolveConcepts([
    { text: 'Hiking', type: 'activity' }, { text: 'mountain walk', type: 'activity' }, { text: 'baking', type: 'activity' }, { text: 'chess', type: 'activity' }, { text: 'Hiking', type: 'activity' },
  ], {}, {
    embed: async (texts) => { calls.embed++; return texts.map((t) => vectors[t]); },
    tieBreakMany: async (batch) => { calls.tie++; return { answers: batch.map((b, i) => ({ i: i + 1, conceptId: b.text === 'baking' ? b.candidates.find((c) => c.label === 'cooking')?.id : null })) }; },
  }).catch((err) => err);
  if (out instanceof Error) throw out;
  const ids = Object.fromEntries((await Concept.find().lean()).map((c) => [c.name, String(c._id)]));
  assert.equal(out.get('activity|Hiking'), ids.trekking, 'alias');
  assert.equal(calls.embed, 1, 'one embedding call for everything left');
  assert.ok(calls.tie <= 1, 'at most one tie-break call');
  assert.ok(out.get('activity|chess'), 'a far phrase becomes a new concept');
});

test('merged turn prompt: the read instructions and the reply rules in one request, one JSON object', () => {
  const plan = { targetWords: 10, burst: 1, askBack: true, emoji: null, laugh: null, reactions: [], mustDisagree: false, topic: null, language: { primary: 'en' } };
  const [sys, user] = agentTurn.build({
    reply: { firstName: 'Meera', matchName: 'Ishaan', style: '', exemplars: [], myFacts: ['[F1] likes: trekking'], guidance: [], tone: [], aboutThem: [], transcript: ['Ishaan: hey'], plan },
    read: { myName: 'Meera', theirName: 'Ishaan', latest: 'hey, love treks', context: [], myLast: null, agenda: [], attributes: 'smoking (never|sometimes)' },
  });
  assert.match(sys.content, /You are Meera, texting a match/);
  assert.match(sys.content, /"notes": facts about Ishaan/);
  assert.match(sys.content, /\{"read": \{"concepts"/);
  assert.equal((sys.content.match(/Output JSON/g) ?? []).length, 0, 'no leftover per-prompt output lines');
  assert.match(user.content, /Ishaan's latest message\(s\):\nhey, love treks/);
  assert.match(user.content, /ONE JSON object/);
});

test('clarify topics from the trust check join an agenda built in parallel', () => {
  const agenda = [{ id: 'a1', topic: 'smoking', priority: 1, status: 'open' }, { id: 'a2', topic: 'trekking', priority: 0.4, status: 'open' }];
  const out = addClarify(agenda, { contradictions: [{ topic: 'job', severity: 1 }, { topic: 'smoking', severity: 2 }, { topic: 'age', severity: 3 }] });
  assert.deepEqual(out.map((a) => [a.id, a.topic]), [['a1', 'smoking'], ['a2', 'job'], ['a3', 'trekking']]);
  assert.equal(addClarify(agenda, undefined), agenda);
});

test('phase-1 build: questionnaire facts, voice metrics and the gate with no model call; graph is "building"', async () => {
  const persona = JSON.parse(readFileSync(new URL('../seed/personas.json', import.meta.url))).find((p) => p.answers?.C);
  const user = await User.create({ email: 'quick@t.local', name: persona.profile.name, passwordHash: 'x', consentAgent: true, consentAt: new Date(), onboarding: { status: 'processing', answers: persona.answers } });
  await Profile.create({ userId: user._id, name: persona.profile.name, age: 28, gender: 'woman', interestedIn: ['man'], city: 'Pune' });
  const t = Date.now();
  await buildUserGraph(user._id, { quick: true }); // LLM_ENABLED is false in tests: any model call would throw
  const ms = Date.now() - t;
  const [u, facts, voice, profile] = await Promise.all([User.findById(user._id).lean(), KgFact.find({ subjectId: user._id }).lean(), VoiceProfile.findOne({ userId: user._id }).lean(), Profile.findOne({ userId: user._id }).lean()]);
  assert.equal(u.onboarding.status, 'done');
  assert.equal(u.graphStatus, 'building');
  assert.ok(facts.length >= 10, `questionnaire facts (${facts.length})`);
  assert.ok(!facts.some((f) => f.source === 'questionnaire_story'), 'no story facts yet');
  assert.ok(voice?.wordCounts?.length, 'voice metrics');
  assert.ok(profile.gate?.gender, 'gate built');
  assert.ok(ms < 5000, `phase 1 took ${ms} ms`);
  await mongoose.connection.collection('users').deleteOne({ _id: user._id });
});
