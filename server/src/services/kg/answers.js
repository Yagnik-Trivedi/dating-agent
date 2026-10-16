// Zod schema for submitted onboarding answers (plan 05 §4), built from questions.js so the two never drift apart.
import { z } from 'zod';
import { KG } from './config.js';
import { QUESTIONS } from './questions.js';

const section = (id) => QUESTIONS.sections.find((s) => s.id === id);
const text = (max) => z.string().trim().max(max);
const B = section('B');

const bItem = (item) => {
  const values = item.options.map((o) => o.value);
  return z.object({
    answer: z.enum(values),
    importance: z.enum(B.importance.map((i) => i.value), { error: 'Pick how much this matters' }), // no default (F7)
    accepts: z.array(z.enum(values)).min(1).default(values),
    dealbreaker: z.boolean().default(false),
  }).refine((a) => !a.dealbreaker || a.accepts.length < values.length, {
    message: 'A dealbreaker needs at least one option you would not accept', path: ['accepts'],
  });
};

export const answersSchema = z.object({
  I: z.object({
    job: text(120).optional(),
    languages: z.array(text(40)).max(12).default([]),
    family: text(200).optional(),
  }).default({ languages: [] }),
  A: z.object(Object.fromEntries(section('A').items.map((i) => [i.id, z.number().int().min(1).max(5)]))),
  B: z.object(Object.fromEntries(B.items.map((i) => [i.id, bItem(i)]))),
  C: z.partialRecord(z.enum(section('C').items.map((i) => i.id)), text(600)).refine(
    (c) => Object.values(c).filter((v) => v?.trim()).length >= KG.MIN_STORIES,
    { message: `Answer at least ${KG.MIN_STORIES} story prompts` },
  ),
  D: z.object({
    interests: z.array(z.object({ name: text(40).min(1), intensity: z.enum(['casual', 'into_it', 'obsessed']).default('into_it') })).max(30).default([]),
  }).default({ interests: [] }),
  E: z.object(Object.fromEntries(section('E').items.map((i) => [i.id, text(400).min(1, 'Reply to every message')]))),
});
