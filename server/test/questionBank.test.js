// Plan 33 Q1 (B4): the question bank, module answers → brain-map facts and links, T8's hedge prior, branch-aware
// retrieval, and a per-module build that touches only its own module (ephemeral replica set, no LLM: quick builds).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Concept } from '../src/models/Concept.js';
import { KgEdge } from '../src/models/KgEdge.js';
import { KgFact } from '../src/models/KgFact.js';
import { User } from '../src/models/User.js';
import { VoiceSample } from '../src/models/VoiceSample.js';
import { moduleAnswersSchema } from '../src/services/kg/answers.js';
import { buildModule } from '../src/services/kg/buildModule.js';
import { resetConceptCache } from '../src/services/kg/canonicalize.js';
import { GATE_ATTRIBUTES } from '../src/services/match/gate.js';
import { hedgePriorOf, moduleFacts, moduleProgress, moduleTraitScores } from '../src/services/kg/moduleFacts.js';
import { allTraitScores, questionnaireFacts } from '../src/services/kg/questionnaireFacts.js';
import { ALIASES, MODULES, QUESTIONS } from '../src/services/kg/questions.js';
import { computeVoiceProfile } from '../src/services/kg/voiceProfile.js';
import { brainLinks } from '../src/services/persona/cache.js';
import { branchNeighbours } from '../src/services/persona/contextBuilder.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(async () => { await start(); env.LLM_ENABLED = false; });
after(stop);

test('every module question has a branch, a type, a use and a tier; follow-ups too; old story ids are aliases', () => {
  assert.equal(MODULES.length, 15); // + the core = 16
  for (const m of MODULES) {
    for (const q of [...m.questions, ...m.questions.flatMap((x) => x.subs)]) {
      assert.ok(['tap', 'pick', 'line', 'story', 'reply', 'why'].includes(q.type), `${q.id} type`);
      assert.ok(q.branch?.length >= 2 && q.branch[0] === m.area, `${q.id} branch`);
      if (!q.role) assert.ok(q.text, `${q.id} text`);
    }
    for (const q of m.questions) {
      assert.ok(['agent', 'judge', 'both'].includes(q.uses), `${q.id} uses`);
      assert.ok(['surface', 'personal', 'deep'].includes(q.tier), `${q.id} tier`);
      assert.ok(['public', 'if_asked', 'private'].includes(q.disclosure), `${q.id} disclosure`);
    }
  }
  assert.deepEqual(Object.keys(ALIASES).sort(), ['C.argue', 'C.friends_rely', 'C.hill', 'C.laugh', 'C.place', 'C.sunday', 'C.weirdly_good']);
  // The B option values (gate, basics, needToAsk) are unchanged; the reworded core keeps every id and adds "say more".
  const B = QUESTIONS.sections.find((s) => s.id === 'B');
  assert.deepEqual(B.items.map((i) => i.id), GATE_ATTRIBUTES);
  assert.deepEqual(B.items.find((i) => i.id === 'smoking').options.map((o) => o.value), ['never', 'socially', 'regularly']);
  assert.equal(B.items.find((i) => i.id === 'kids').text, 'Kids someday?');
  assert.ok(B.items.find((i) => i.id === 'kids').more);
  // [for you] and judge-only answers are never raised: love & dating is if_asked, its boundary question private.
  const R = MODULES.find((m) => m.id === 'R');
  assert.ok(R.questions.every((q) => q.disclosure !== 'public'));
  assert.equal(R.questions.find((q) => q.id === 'R8').disclosure, 'private');
});

test('"idk" and "can\'t decide" are valid answers; a wrong option is not', () => {
  assert.deepEqual(moduleAnswersSchema('T').parse({ T1: 'never_tried', T9: 'idk honestly', T10: 'idk' }), { T1: 'never_tried', T9: 'idk honestly', T10: 'idk' });
  assert.equal(moduleAnswersSchema('F').parse({ F2: 'can_t_decide' }).F2, 'can_t_decide');
  assert.throws(() => moduleAnswersSchema('F').parse({ F2: 'maybe' }));
  assert.throws(() => moduleAnswersSchema('F').parse({ Z9: 'x' }));
});

test('answers land on their branch and depth tier; can\'t decide → uncertain; current facts expire; links are made', () => {
  const now = Date.UTC(2026, 9, 23);
  const F = moduleFacts('F', { F5: 'coffee', F5_1: 'strong, no sugar', F5_2: 'the tiny place near college', F3: 'biryani is overrated', F3_1: 'very_strongly', F2: 'can_t_decide' }, { now });
  const coffee = F.facts.find((f) => f.slot === 'M.F5');
  assert.deepEqual(coffee.branch, ['food & drink', 'chai or coffee']);
  assert.equal(coffee.depthTier, 'surface');
  assert.equal(coffee.conceptText, 'coffee');
  assert.deepEqual(F.facts.find((f) => f.slot === 'M.F5_2').branch, ['food & drink', 'chai or coffee', 'favourite place']);
  assert.equal(F.facts.find((f) => f.slot === 'M.F2').uncertain, true);
  assert.equal(F.facts.find((f) => f.slot === 'M.F3').strength, 0.9, '"how strongly" sets the parent');
  assert.ok(!F.facts.some((f) => f.slot === 'M.F3_1'), 'a strength follow-up is not a fact');
  assert.deepEqual(F.links.filter((l) => l.type === 'BRANCH_OF').map((l) => l.from).sort(), ['M.F5_1', 'M.F5_2']);

  const W = moduleFacts('W', { W1: 'mid-sems, CFD is killing me', W8: 'wake at 7, college, gym, then I cook with my flatmate and we watch something', W8_1: 'cooking' }, { now });
  const busy = W.facts.find((f) => f.slot === 'M.W1');
  assert.equal(busy.isCurrent, true);
  assert.equal(+busy.currentUntil, now + 30 * 86_400_000);
  assert.equal(W.facts.find((f) => f.slot === 'M.W8').predicate, 'story');
  assert.equal(W.facts.find((f) => f.slot === 'M.W8').depthTier, 'personal');
  assert.deepEqual(W.extract.map((e) => e.qid), ['W8'], 'only stories and long answers go to the model');

  const O = moduleFacts('O', { O6: 'trekking', O6_3: 'clears my head' });
  const why = O.facts.find((f) => f.slot === 'M.O6_3');
  assert.equal(why.predicate, 'values');
  assert.equal(why.depthTier, 'deep', 'a why-chain is deep');
  assert.deepEqual(O.links, [{ type: 'WHY', from: 'M.O6', to: 'M.O6_3' }]);

  const V = moduleFacts('V', { V8: [{ like: 'Trekking', gives: 'quiet', why: 'my job is loud' }], V1: 'we argued about a trip' });
  assert.deepEqual(V.links, [{ type: 'WHY', from: 'M.V8.1.like', to: 'M.V8.1.gives' }, { type: 'WHY', from: 'M.V8.1.gives', to: 'M.V8.1.why' }]);
  assert.equal(V.facts.find((f) => f.slot === 'M.V1').disclosure, 'if_asked');
  assert.equal(V.facts.find((f) => f.slot === 'M.V1').depthTier, 'deep');

  const L = moduleFacts('T', { T9: 'whether to do an MS abroad' });
  assert.equal(L.facts[0].uncertain, true, 'a question about indecision is uncertain');
  assert.equal(moduleFacts('W', { W5: 'idk tbh' }).facts[0].uncertain, true);
  assert.deepEqual(moduleFacts('X', { X1: 'ugh sameee' }).samples, [{ qid: 'X1', incoming: 'ugh today was so long', text: 'ugh sameee', mood: 'tired' }]);
});

test('trait picks replace the agree/disagree statements for that trait; core values get their branch and "say more"', () => {
  assert.deepEqual(moduleTraitScores({ S: { S2: 'leaving_early', S7: 'alone' }, D: { D5: 'tidy' } }), { extraversion: 0.2, conscientiousness: 0.8 });
  const traits = allTraitScores({ A: { a1: 5, a5: 5 }, M: { S: { S2: 'leaving_early' } } });
  assert.equal(traits.extraversion, 0.2, 'the pick replaces a1');
  assert.equal(traits.openness, 1, 'Likert still counts where no pick exists');
  const facts = questionnaireFacts({ B: { kids: { answer: 'open', importance: 'high', more: 'two, maybe, later' } } });
  const kids = facts.find((f) => f.attribute === 'kids');
  assert.deepEqual(kids.branch, ['the future', 'kids']);
  assert.equal(kids.depthTier, 'deep');
  const more = facts.find((f) => f.slot === 'B.kids.more');
  assert.equal(more.object, 'what does that look like for you: two, maybe, later');
});

test('T8 sets the hedge prior; progress counts old story answers', () => {
  assert.equal(hedgePriorOf({ M: { T: { T8: 'i_change_my_mind_a_lot' } } }), 0.6);
  assert.equal(hedgePriorOf({}), null);
  const samples = [{ text: 'yes for sure' }, { text: 'definitely the beach' }];
  assert.equal(computeVoiceProfile(samples).hedgeRate, 0);
  assert.ok(computeVoiceProfile(samples, { hedgePrior: 0.6 }).hedgeRate > 0.3);
  const p = moduleProgress({ C: { sunday: 'slow breakfast' }, M: { W: { W1: 'exams' } } });
  assert.equal(p.modules.W.answered, 2, 'W1 + W9 (from the old sunday story)');
});

test('retrieval: touching a fact offers its children, the reason and ONE associated hop; private never', () => {
  const f = (id, extra = {}) => ({ _id: id, predicate: 'likes', object: id, disclosure: 'public', ...extra });
  const coffee = f('coffee'), place = f('place'), howTake = f('how'), reason = f('reason', { predicate: 'values' }), morning = f('morning'), cafe = f('cafe'), secret = f('secret', { disclosure: 'private' });
  const links = brainLinks([
    { type: 'BRANCH_OF', from: { id: 'place' }, to: { id: 'coffee' } }, { type: 'BRANCH_OF', from: { id: 'how' }, to: { id: 'coffee' } },
    { type: 'WHY', from: { id: 'coffee' }, to: { id: 'reason' } }, { type: 'ASSOCIATED', from: { id: 'coffee' }, to: { id: 'morning' } },
    { type: 'ASSOCIATED', from: { id: 'coffee' }, to: { id: 'cafe' } }, { type: 'BRANCH_OF', from: { id: 'secret' }, to: { id: 'coffee' } },
  ]);
  const persona = { links };
  const out = branchNeighbours(persona, [coffee], [place, howTake, reason, morning, cafe], 4);
  assert.deepEqual(out.map((x) => x._id), ['place', 'how', 'reason', 'morning']);
  assert.ok(!branchNeighbours(persona, [coffee], [place, morning, cafe], 3).includes(cafe), 'one associated hop only');
  assert.ok(!branchNeighbours(persona, [coffee], [place], 3).includes(secret), 'not in the sayable pool → never offered');
  assert.deepEqual(branchNeighbours({}, [coffee], [place]), [], 'no links (older graphs) → nothing extra');
});

test('a per-module build touches only that module; re-saving drops removed answers; ASSOCIATED across branches', async () => {
  resetConceptCache();
  const coffee = await Concept.create({ name: 'coffee', label: 'coffee', type: 'food', aliases: [] });
  const user = await User.create({ email: 'mod@test.local', passwordHash: 'x', name: 'Meera', consentAgent: true, consentAt: new Date(),
    onboarding: { status: 'done', answers: { M: { F: { F5: 'coffee', F5_2: 'the tiny place near college', F2: 'can_t_decide' }, W: { W4: 'coffee', W10: 'Prateek Kuhad' }, X: { X1: 'ugh same, hbu' } } } } });
  const other = await KgFact.create({ subjectId: user._id, predicate: 'likes', object: 'trekking', source: 'questionnaire_choice' });

  await buildModule(user._id, 'F', { quick: true });
  await buildModule(user._id, 'W', { quick: true });
  await buildModule(user._id, 'X', { quick: true });
  const F = await KgFact.find({ subjectId: user._id, module: 'F' }).lean();
  assert.deepEqual(F.map((f) => f.slot).sort(), ['M.F2', 'M.F5', 'M.F5_2']);
  assert.equal(String(F.find((f) => f.slot === 'M.F5').conceptId), String(coffee._id));
  const branchOf = await KgEdge.find({ subjectId: user._id, type: 'BRANCH_OF', module: 'F' }).lean();
  assert.equal(branchOf.length, 1);
  const assoc = await KgEdge.find({ subjectId: user._id, type: 'ASSOCIATED' }).lean();
  assert.equal(assoc.length, 1, 'coffee under food and under "right now"');
  assert.equal(await VoiceSample.countDocuments({ userId: user._id, source: 'module', qid: 'X1' }), 1);

  // Re-save F without F2: only F changes.
  const W = await KgFact.find({ subjectId: user._id, module: 'W' }).lean();
  await User.updateOne({ _id: user._id }, { $unset: { 'onboarding.answers.M.F.F2': 1 } });
  await buildModule(user._id, 'F', { quick: true });
  assert.deepEqual((await KgFact.find({ subjectId: user._id, module: 'F' }).lean()).map((f) => f.slot).sort(), ['M.F5', 'M.F5_2']);
  assert.deepEqual((await KgFact.find({ subjectId: user._id, module: 'W' }).lean()).map((f) => String(f._id)).sort(), W.map((f) => String(f._id)).sort(), 'W untouched');
  assert.ok(await KgFact.exists({ _id: other._id }), 'core facts untouched');
  assert.ok((await User.findById(user._id).lean()).graphVersion >= 4, 'every build bumps graphVersion');
  await mongoose.connection.db.collection('concepts').deleteMany({});
  resetConceptCache();
});
