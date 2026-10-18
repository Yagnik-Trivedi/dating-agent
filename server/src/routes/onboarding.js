import { Router } from 'express';
import { z } from 'zod';
import { answersSchema } from '../services/kg/answers.js';
import { buildUserGraph, startUserGraphBuild } from '../services/kg/buildUserGraph.js';
import { queueProfileCheck } from '../services/trust/checkProfile.js';
import { QUESTIONS } from '../services/kg/questions.js';
import { httpError, parse } from '../utils/http.js';

export const onboardingRouter = Router();

onboardingRouter.get('/onboarding/questions', (req, res) => res.json(QUESTIONS));

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

onboardingRouter.get('/onboarding/status', (req, res) => {
  res.json({ status: req.user.onboarding?.status ?? 'not_started' });
});
