// Zod schema for submitted onboarding answers (plan 05 §4), built from questions.js so the two never drift apart.
import { z } from 'zod';
import { KG } from './config.js';
import { QUESTIONS } from './questions.js';
import { DEVICES } from './textingStyle.js';

const section = (id) => QUESTIONS.sections.find((s) => s.id === id);
const text = (max) => z.string().trim().max(max);
const B = section('B');
// Plan 32 KP1: which device each reply was typed on (from the browser), so desktop replies count less for emoji/length.
const devices = () => z.partialRecord(z.enum(section('E').items.map((i) => i.id)), z.enum(DEVICES));

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

// Plan 30 S2: a ~5-minute core. Personality statements (A) and stories (C) move to "Teach your agent more"; values (B)
// can be skipped item by item; 5 core replies (E) are required, the other 10 are optional.
export const answersSchema = z.object({
  I: z.object({
    job: text(120).optional(),
    workplace: text(120).optional(),
    education: text(120).optional(),
    height: text(20).optional(),
    languages: z.array(text(40)).max(12).default([]),
    family: text(200).optional(),
  }).default({ languages: [] }),
  A: z.object(Object.fromEntries(section('A').items.map((i) => [i.id, z.number().int().min(1).max(5)]))).partial().default({}),
  B: z.object(Object.fromEntries(B.items.map((i) => [i.id, bItem(i)]))).partial(),
  C: z.partialRecord(z.enum(section('C').items.map((i) => i.id)), text(600)).default({}),
  D: z.object({
    interests: z.array(z.object({ name: text(40).min(1), intensity: z.enum(['casual', 'into_it', 'obsessed']).default('into_it') })).max(30).default([]),
  }).default({ interests: [] }),
  E: z.partialRecord(z.enum(section('E').items.map((i) => i.id)), text(400)).refine(
    (e) => KG.CORE_REPLY_IDS.every((id) => e[id]?.trim()),
    { message: `Reply to all ${KG.CORE_REPLY_IDS.length} messages` },
  ),
  Edevice: devices().default({}),
});

/** "Teach your agent more" blocks (plan 30 S2): any subset of A, C and E, merged into the saved answers. */
export const moreSchema = z.object({
  A: z.object(Object.fromEntries(section('A').items.map((i) => [i.id, z.number().int().min(1).max(5)]))).partial().optional(),
  C: z.partialRecord(z.enum(section('C').items.map((i) => i.id)), text(600)).optional(),
  E: z.partialRecord(z.enum(section('E').items.map((i) => i.id)), text(400)).optional(),
  Edevice: devices().optional(),
}).refine((m) => ['A', 'C', 'E'].some((k) => m[k] && Object.values(m[k]).some((v) => String(v).trim())), { message: 'Answer at least one question' });
