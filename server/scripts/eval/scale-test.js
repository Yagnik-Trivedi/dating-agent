// Plan 11 (owner's reduced scope): scale test with NO LLM calls, on a LOCAL in-memory replica set (never Atlas).
// Inserts N synthetic users (random gates, ~60 concept-linked facts, a voice profile, 20 voice samples) with every
// production index, then measures discover/gate query p50/p95, per-message context build (persona cache miss/hit) and
// storage per user.   node scripts/eval/scale-test.js [--users 2000]   → eval/results/scale.md
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';

process.env.LLM_ENABLED = 'false'; // any LLM or embedding call would throw: this test must make none
const args = process.argv.slice(2);
const N = Number(args.includes('--users') ? args[args.indexOf('--users') + 1] : 2000);
const { start, stop } = await import('../lib/testDb.js');
const mongoose = (await import('mongoose')).default;
for (const f of readdirSync(new URL('../../src/models/', import.meta.url))) await import(`../../src/models/${f}`); // every model → every index
const { KG } = await import('../../src/services/kg/config.js');
const { QUESTIONS } = await import('../../src/services/kg/questions.js');
const { gateFrom, discoverQuery } = await import('../../src/services/match/gate.js');
const { loadPersona, clearPersonaCache } = await import('../../src/services/persona/cache.js');
const { selectFacts, selectExemplars } = await import('../../src/services/persona/contextBuilder.js');
const { rng: seeded } = await import('../../src/utils/rng.js');
const { PUBLIC_PROJECTION } = await import('../../src/models/Profile.js');
const M = mongoose.models;

const rng = seeded(42);
const pick = (xs) => xs[Math.floor(rng() * xs.length)];
const DIMS = 2048; // nemotron-3-embed-1b
const vec = () => Float32Array.from({ length: DIMS }, () => rng() * 2 - 1);
const CITIES = ['Ahmedabad', 'Mumbai', 'Bengaluru', 'Pune', 'Delhi'];
const B = QUESTIONS.sections.find((s) => s.id === 'B').items;
const t = () => performance.now();
const pctl = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const ms = (x) => `${x.toFixed(1)} ms`;

const t0 = Date.now();
await start();
await Promise.all(Object.values(M).map((Model) => Model.createIndexes()));
console.log(`In-memory replica set up; ${Object.keys(M).length} models indexed. Seeding ${N} synthetic users…`);

// Shared concepts (embedded once for everyone, plan 15 §6.3).
const concepts = await M.Concept.insertMany(Array.from({ length: 400 }, (_, i) => ({
  name: `concept ${i}`, label: `concept ${i}`, type: pick(['activity', 'food', 'place', 'topic', 'media']), embedding: vec(), embeddingModel: 'synthetic', createdBy: 'seed',
})));

const users = [];
for (let i = 0; i < N; i++) {
  const gender = rng() < 0.5 ? 'woman' : 'man';
  const answers = Object.fromEntries(B.map((item) => {
    const answer = pick(item.options).value;
    const dealbreaker = rng() < 0.05;
    return [item.id, { answer, importance: pick(['low', 'medium', 'high']), dealbreaker, accepts: dealbreaker ? [answer] : item.options.map((o) => o.value) }];
  }));
  const profile = { name: `Synth${i}`, age: 21 + Math.floor(rng() * 15), city: pick(CITIES), gender, interestedIn: [rng() < 0.92 ? (gender === 'woman' ? 'man' : 'woman') : gender] };
  users.push({ _id: new mongoose.Types.ObjectId(), profile, gate: gateFrom(profile, answers) });
}
const BATCH = 250;
for (let i = 0; i < N; i += BATCH) {
  const chunk = users.slice(i, i + BATCH);
  await M.User.collection.insertMany(chunk.map((u) => ({ _id: u._id, email: `synth${i}-${u._id}@synthetic.local`, passwordHash: 'x', name: u.profile.name, consentAgent: true, consentAt: new Date(), agentMode: 'auto', graphVersion: 1, onboarding: { status: 'done' } })));
  await M.Profile.insertMany(chunk.map((u) => ({ userId: u._id, ...u.profile, gate: u.gate })));
  await M.KgFact.insertMany(chunk.flatMap((u) => Array.from({ length: 60 }, (_, k) => {
    const loose = k % 10 === 0; // ~10% concept-less facts carry their own vector
    const c = pick(concepts);
    return {
      subjectId: u._id, observerId: null, predicate: pick(['likes', 'likes', 'dislikes', 'values', 'lifestyle', 'story', 'opinion']),
      object: loose ? `a personal story ${k}` : c.label, ...(loose ? { embedding: vec() } : { conceptId: c._id }),
      strength: rng(), confidence: 0.6 + rng() * 0.4, source: 'questionnaire_story', disclosure: rng() < 0.05 ? 'private' : 'public',
      evidence: [{ quote: 'synthetic', sourceRef: { kind: 'answer', id: 'C' } }],
    };
  })));
  await M.VoiceProfile.insertMany(chunk.map((u) => ({ userId: u._id, wordCounts: [4, 8, 12, 15], emojiPerMessage: rng(), questionBackRate: 0.4, laughRate: 0.3, language: { mix: { en: 1 }, codeSwitchRate: 0, mirrorsLanguage: 0.5 } })));
  await M.VoiceSample.insertMany(chunk.flatMap((u) => Array.from({ length: 20 }, (_, k) => ({
    userId: u._id, incoming: `incoming ${k}`, text: `a synthetic reply number ${k}`, source: 'onboarding', lang: { languages: ['en'], script: 'latin', codeSwitch: false }, embedding: vec(),
  }))));
}
const seedSeconds = (Date.now() - t0) / 1000;
console.log(`Seeded in ${seedSeconds.toFixed(0)} s.`);

// 1. Discover / gate: the production pipeline (one indexed $match, random $sample) for 500 random users.
const sample = Array.from({ length: Math.min(500, N) }, () => pick(users));
const discover = [];
for (const u of sample) {
  const s = t();
  await M.Profile.aggregate([{ $match: discoverQuery(u.gate, [u._id]) }, { $sample: { size: 20 } }, { $project: PUBLIC_PROJECTION }]);
  discover.push(t() - s);
}
const plan = await M.Profile.find(discoverQuery(sample[0].gate, [sample[0]._id])).explain('executionStats');
const winning = JSON.stringify(plan.queryPlanner?.winningPlan ?? plan);
const indexName = winning.match(/"indexName":"([^"]+)"/)?.[1] ?? 'none (COLLSCAN)';
const examined = plan.executionStats?.totalDocsExamined;

// 2. Context build per message (no LLM): persona load (cache miss vs hit) + fact selection + exemplar selection.
const ctx = { miss: [], hit: [] };
for (const u of sample.slice(0, 200)) {
  const incomingVec = vec();
  for (const kind of ['miss', 'hit']) {
    if (kind === 'miss') clearPersonaCache();
    const s = t();
    const persona = await loadPersona(u._id);
    selectFacts(persona, { incomingVec, incomingText: 'synthetic incoming', rng });
    selectExemplars(persona, { incomingVec, rng });
    ctx[kind].push(t() - s);
  }
}

// 3. Storage per user (data + indexes); concepts are shared, so they're reported separately.
const db = mongoose.connection.db;
const stat = async (name) => { const s = await db.command({ collStats: name }); return { data: s.size, index: s.totalIndexSize }; };
const per = {};
for (const name of ['users', 'profiles', 'kgfacts', 'voiceprofiles', 'voicesamples']) per[name] = await stat(name);
const conceptStat = await stat('concepts');
const perUser = Object.values(per).reduce((s, x) => s + x.data + x.index, 0) / N;
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const M0 = 512 * 1024 * 1024;

const md = [
  '# Scale test (no LLM calls)', '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node scripts/eval/scale-test.js\` on a local in-memory replica set (never Atlas), every production index created.`,
  `${N.toLocaleString('en')} synthetic users × (60 facts, ~90% linked to 400 shared concepts; 1 voice profile; 20 voice samples), ${KG.EMBED_STORAGE} vectors of ${DIMS} dims. Seeding took ${seedSeconds.toFixed(0)} s.`, '',
  '| Measure | p50 | p95 |', '|---|---|---|',
  `| Discover (gate both ways, one \`$match\` + \`$sample\` 20), ${sample.length} users | ${ms(pctl(discover, 50))} | ${ms(pctl(discover, 95))} |`,
  `| Context build per message, persona cache **miss** (load facts + voice + samples, select facts + exemplars) | ${ms(pctl(ctx.miss, 50))} | ${ms(pctl(ctx.miss, 95))} |`,
  `| Context build per message, persona cache **hit** | ${ms(pctl(ctx.hit, 50))} | ${ms(pctl(ctx.hit, 95))} |`, '',
  `- Discover uses index \`${indexName}\`; ${examined ?? '?'} profiles examined for one query.`,
  `- **Storage per user** (data + indexes): ${kb(perUser)} → about **${Math.floor(M0 / perUser).toLocaleString('en')} users fit in Atlas M0 (512 MB)**. Breakdown per user: ${Object.entries(per).map(([k, v]) => `${k} ${kb((v.data + v.index) / N)}`).join(', ')}.`,
  `- Shared concepts: ${kb(conceptStat.data + conceptStat.index)} in total for 400 concepts (embedded once for everyone).`, '',
].join('\n');
mkdirSync(new URL('../../eval/results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../eval/results/scale.md', import.meta.url), `${md}\n`);
console.log(`\n${md}\nWrote eval/results/scale.md (${((Date.now() - t0) / 1000).toFixed(0)} s total).`);
await stop();
