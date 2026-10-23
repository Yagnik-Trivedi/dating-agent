import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { answersSchema, dropBlank, moduleAnswersSchema, moreSchema } from '../services/kg/answers.js';
import { buildModule, startModuleBuild } from '../services/kg/buildModule.js';
import { buildUserGraph, startUserGraphBuild } from '../services/kg/buildUserGraph.js';
import { moduleProgress } from '../services/kg/moduleFacts.js';
import { queueProfileCheck } from '../services/trust/checkProfile.js';
import { KG } from '../services/kg/config.js';
import { rebuildVoice } from '../services/kg/learning.js';
import { ALIASES, MODULE_IDS, MODULES, QUESTIONS } from '../services/kg/questions.js';
import { TEXTING_STYLE, textingStyleSchema } from '../services/kg/textingStyle.js';
import { httpError, parse } from '../utils/http.js';

export const onboardingRouter = Router();

onboardingRouter.get('/onboarding/questions', (req, res) => res.json({ ...QUESTIONS, coreReplyIds: KG.CORE_REPLY_IDS, textingStyle: TEXTING_STYLE, photosRequired: env.PHOTOS_REQUIRED }));

// Plan 32 KP1 "How do you usually text?": taps only, any subset. Saved on the user (a graph rebuild keeps it); the
// voice profile is re-blended right away (code only) when there are samples, else the onboarding build picks it up.
onboardingRouter.put('/onboarding/texting-style', async (req, res) => {
  const style = parse(textingStyleSchema, req.body);
  req.user.textingStyle = { ...style, at: new Date() };
  await req.user.save();
  await rebuildVoice({ userId: req.user._id });
  res.json({ textingStyle: req.user.textingStyle });
});

onboardingRouter.post('/onboarding/submit', async (req, res) => {
  const { answers } = parse(z.object({ answers: answersSchema }), req.body);
  if (req.user.onboarding?.status === 'processing') throw httpError(409, 'ALREADY_PROCESSING', 'Your answers are already being processed');
  const savedM = req.user.onboarding?.answers?.M; // plan 33: module answers are saved per module and survive a re-submit
  req.user.onboarding = { status: 'processing', answers: { ...answers, ...(savedM && { M: savedM }) } };
  await req.user.save();
  // Plan 30 S1: phase 1 (no model calls) here, so the app is usable as soon as this returns; phase 2 is a job.
  const quick = await buildUserGraph(req.user._id, { quick: true }).catch((err) => { console.error(`onboarding ${req.user._id}: quick build failed: ${err.message}`); return null; });
  await startUserGraphBuild(req.user._id);
  queueProfileCheck(req.user._id); // ready before the first match
  res.json({ status: quick ? 'done' : 'processing' });
});

// Plan 30 S2 "Teach your agent more": stories, more replies or the personality statements, merged into my answers.
// ponytail: re-runs the whole phase 2 (idempotent by fact key); a per-block build if story re-extraction costs too much.
onboardingRouter.post('/onboarding/more', async (req, res) => {
  const more = parse(moreSchema, req.body);
  const saved = req.user.onboarding?.answers;
  if (!saved || req.user.onboarding.status === 'processing') throw httpError(409, 'NOT_READY', 'Finish the first part of onboarding first');
  const answers = { ...saved };
  for (const [k, v] of Object.entries(more)) if (v) answers[k] = { ...saved[k], ...v };
  req.user.onboarding.answers = answers;
  req.user.markModified('onboarding.answers');
  await req.user.save();
  await startUserGraphBuild(req.user._id);
  res.json({ status: 'building' });
});

// Plan 33 Q1: the modules (questions + follow-ups) with my answers and progress, and the brain-strength meter.
onboardingRouter.get('/onboarding/modules', (req, res) => {
  const answers = req.user.onboarding?.answers ?? {};
  const progress = moduleProgress(answers);
  const aliased = Object.fromEntries(Object.entries(ALIASES).map(([alias, qid]) => [qid, answers.C?.[alias.slice(2)]]).filter(([, v]) => v));
  res.json({
    modules: MODULES.map((m) => ({ ...m, progress: progress.modules[m.id] })),
    answers: answers.M ?? {},
    fromStories: aliased, // today's story answers that count toward a module question (A4's mapping)
    strength: { filled: progress.filled, total: progress.total, modulesDone: Object.values(progress.modules).filter((p) => p.done).length },
    core: { values: QUESTIONS.sections.find((s) => s.id === 'B').items.map((i) => ({ id: i.id, text: i.text, more: i.more ?? null, answer: answers.B?.[i.id]?.answer ?? null, moreAnswer: answers.B?.[i.id]?.more ?? '' })) },
  });
});

// Save one module (merged into what was saved before; a blank answer removes it) and build only that module:
// the user's own words right away, the finer facts in the `buildModule` job.
onboardingRouter.post('/onboarding/module/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.enum(MODULE_IDS) }), req.params);
  const { answers: raw } = parse(z.object({ answers: z.record(z.string(), z.unknown()) }), req.body);
  if (req.user.onboarding?.status !== 'done') throw httpError(409, 'NOT_READY', 'Finish the first part of onboarding first');
  const cleared = Object.keys(raw).filter((k) => !Object.keys(dropBlank(raw)).includes(k));
  const answers = parse(moduleAnswersSchema(id), dropBlank(raw));
  const saved = { ...(req.user.onboarding.answers?.M?.[id] ?? {}), ...answers };
  for (const k of cleared) delete saved[k];
  req.user.onboarding.answers = { ...req.user.onboarding.answers, M: { ...req.user.onboarding.answers?.M, [id]: saved } };
  req.user.markModified('onboarding.answers');
  await req.user.save();
  const quick = await buildModule(req.user._id, id, { quick: true }).catch((err) => { console.error(`module ${id} ${req.user._id}: quick build failed: ${err.message}`); return null; });
  await startModuleBuild(req.user._id, id);
  const progress = moduleProgress(req.user.onboarding.answers);
  res.json({ status: quick ? 'saved' : 'building', progress: progress.modules[id], strength: { filled: progress.filled, total: progress.total } });
});

// Plan 33 B2: a module's core value "say more" lines, saved on their own (merged into the B answers).
onboardingRouter.put('/onboarding/values-more', async (req, res) => {
  const body = parse(z.record(z.string(), z.string().trim().max(600)), req.body);
  const B = req.user.onboarding?.answers?.B;
  if (req.user.onboarding?.status !== 'done' || !B) throw httpError(409, 'NOT_READY', 'Finish the first part of onboarding first');
  for (const [attr, more] of Object.entries(body)) if (B[attr]?.answer) B[attr] = { ...B[attr], more: more || undefined };
  req.user.markModified('onboarding.answers');
  await req.user.save();
  await startUserGraphBuild(req.user._id);
  res.json({ status: 'building' });
});

onboardingRouter.get('/onboarding/status',(req, res) => {
  res.json({ status: req.user.onboarding?.status ?? 'not_started' });
});
