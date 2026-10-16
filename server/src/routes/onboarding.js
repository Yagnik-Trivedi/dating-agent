import { Router } from 'express';
import { z } from 'zod';
import { startUserGraphBuild } from '../services/kg/buildUserGraph.js';
import { QUESTIONS } from '../services/kg/questions.js';
import { httpError, parse } from '../utils/http.js';

export const onboardingRouter = Router();

const sectionB = QUESTIONS.sections.find((s) => s.id === 'B');
const text = (max) => z.string().max(max);
const answersSchema = z.object({
  A: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  B: z.record(z.string(), z.object({
    answer: z.string().max(60),
    importance: z.enum(sectionB.importance.map((i) => i.value)).default('important'),
  })).default({}),
  C: z.record(z.string(), text(600)).default({}),
  D: z.object({
    interests: z.array(z.object({ name: text(40), intensity: z.enum(['casual', 'into_it', 'obsessed']).default('into_it') })).max(30).default([]),
  }).default({ interests: [] }),
  E: z.record(z.string(), text(300)).default({}),
});

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
