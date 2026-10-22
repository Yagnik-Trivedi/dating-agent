import { Router } from 'express';
import { z } from 'zod';
import { answersSchema, moreSchema } from '../services/kg/answers.js';
import { buildUserGraph, startUserGraphBuild } from '../services/kg/buildUserGraph.js';
import { queueProfileCheck } from '../services/trust/checkProfile.js';
import { KG } from '../services/kg/config.js';
import { rebuildVoice } from '../services/kg/learning.js';
import { QUESTIONS } from '../services/kg/questions.js';
import { TEXTING_STYLE, textingStyleSchema } from '../services/kg/textingStyle.js';
import { httpError, parse } from '../utils/http.js';

export const onboardingRouter = Router();

onboardingRouter.get('/onboarding/questions', (req, res) => res.json({ ...QUESTIONS, coreReplyIds: KG.CORE_REPLY_IDS, textingStyle: TEXTING_STYLE }));

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
  req.user.onboarding = { status: 'processing', answers };
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

onboardingRouter.get('/onboarding/status',(req, res) => {
  res.json({ status: req.user.onboarding?.status ?? 'not_started' });
});
