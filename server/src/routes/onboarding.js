import { Router } from 'express';
import { z } from 'zod';
import { QUESTIONS } from '../services/kg/questions.js';
import { parse } from '../utils/http.js';

export const onboardingRouter = Router();

onboardingRouter.get('/onboarding/questions', (req, res) => res.json(QUESTIONS));

// Plan 05 adds fact extraction after submit.
onboardingRouter.post('/onboarding/submit', async (req, res) => {
  const { answers } = parse(z.object({ answers: z.record(z.string(), z.unknown()) }), req.body);
  req.user.onboarding = { status: 'processing', answers };
  await req.user.save();
  res.json({ status: 'processing' });
});

onboardingRouter.get('/onboarding/status', (req, res) => {
  res.json({ status: req.user.onboarding?.status ?? 'not_started' });
});
