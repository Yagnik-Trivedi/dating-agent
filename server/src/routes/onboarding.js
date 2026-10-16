import { Router } from 'express';
import { z } from 'zod';
import { answersSchema } from '../services/kg/answers.js';
import { startUserGraphBuild } from '../services/kg/buildUserGraph.js';
import { QUESTIONS } from '../services/kg/questions.js';
import { httpError, parse } from '../utils/http.js';

export const onboardingRouter = Router();

onboardingRouter.get('/onboarding/questions', (req, res) => res.json(QUESTIONS));

onboardingRouter.post('/onboarding/submit', async (req, res) => {
  const { answers } = parse(z.object({ answers: answersSchema }), req.body);
  if (req.user.onboarding?.status === 'processing') throw httpError(409, 'ALREADY_PROCESSING', 'Your answers are already being processed');
  req.user.onboarding = { status: 'processing', answers };
  await req.user.save();
  await startUserGraphBuild(req.user._id);
  res.json({ status: 'processing' });
});

onboardingRouter.get('/onboarding/status', (req, res) => {
  res.json({ status: req.user.onboarding?.status ?? 'not_started' });
});
