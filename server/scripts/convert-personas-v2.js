// Plan 05 §9 (run once; the result is committed): convert seed/personas.json to the v2 questionnaire shape.
//   node scripts/convert-personas-v2.js [--only seed01,seed02] --yes
// - B: importance low/medium/high (v1 nice_to_have/important/dealbreaker), dealbreaker flag, accepts
//   (v1 dealbreaker = only their own answer; otherwise every option)
// - I (identity) + the 7 new voice replies (e9–e15) + stories up to MIN_STORIES, written by the LLM (tier mid) in the
//   persona's own voice from its existing replies. Review the diff by hand before committing.
import { readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../src/config/env.js';
import { KG } from '../src/services/kg/config.js';
import { QUESTIONS } from '../src/services/kg/questions.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { chatJSON } from '../src/services/llm/client.js';
import { mapLimit } from '../src/utils/mapLimit.js';

const FILE = new URL('../seed/personas.json', import.meta.url);
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const section = (id) => QUESTIONS.sections.find((s) => s.id === id);
const IMPORTANCE = { nice_to_have: 'low', important: 'medium', dealbreaker: 'high' };
const personas = JSON.parse(readFileSync(FILE));
const done = (p) => p.answers.I && section('E').items.every((i) => p.answers.E?.[i.id]);
const todo = personas.filter((p) => (!only || only.some((o) => p.email.startsWith(o))) && !done(p));
console.log(`${todo.length} persona(s), ~${todo.length} mid-tier calls (identity + missing replies + missing stories).`);
if (!args.includes('--yes')) process.exit(0);

const schema = z.object({
  job: z.string().trim().min(2).max(120),
  languages: z.array(z.string().trim().toLowerCase()).min(1).max(5),
  replies: z.record(z.string(), z.string().trim().min(1).transform((t) => t.slice(0, 400))), // answers schema max
  stories: z.record(z.string(), z.string().trim().min(1).max(600)).catch({}),
});

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 }); // usage log
await mapLimit(todo, 2, async (p) => { try {
  const a = p.answers;
  const newE = section('E').items.filter((i) => !a.E?.[i.id]); // per persona: re-runs only fill what's missing
  // B → v2 (deterministic).
  for (const item of section('B').items) {
    const b = a.B?.[item.id];
    if (!b || b.accepts) continue;
    const dealbreaker = b.importance === 'dealbreaker';
    a.B[item.id] = { answer: b.answer, importance: IMPORTANCE[b.importance] ?? 'medium', dealbreaker, accepts: dealbreaker ? [b.answer] : item.options.map((o) => o.value) };
  }
  const answeredC = section('C').items.filter((i) => String(a.C?.[i.id] ?? '').trim());
  const missingC = section('C').items.filter((i) => !answeredC.includes(i)).slice(0, Math.max(0, KG.MIN_STORIES - answeredC.length));
  const out = await chatJSON({
    tier: 'mid', reasoning: false, temperature: 0.8, schema, purpose: 'convert-personas-v2',
    messages: [
      { role: 'system', content: [
        'You write onboarding answers for a FICTIONAL, SFW dating-app persona, in exactly their voice.',
        'Match their texting style from the example replies: length, casing, emoji, laughter, slang and language mix.',
        'Each reply is at most 350 characters, even the reply to a long message. Key replies by id exactly (e9 … e15).',
        'Keep everything consistent with their bio, prompts and notes; never add religion, caste or ethnicity.',
        'Output JSON: {"job": "short job or studies", "languages": ["english", ...], "replies": {"<id>": "reply"}, "stories": {"<id>": "1-4 sentences"}}',
      ].join('\n') },
      { role: 'user', content: [
        `Persona: ${p.profile.name}, ${p.profile.age}, ${p.profile.city}. Bio: ${p.profile.bio}`,
        `Notes: ${p.designNotes}`,
        `Their replies so far:\n${section('E').items.filter((i) => a.E?.[i.id]).map((i) => `- "${i.text}" → "${a.E[i.id]}"`).join('\n')}`,
        `Write replies for:\n${newE.map((i) => `- ${i.id}: ${i.prompt ? i.text : `"${i.text}"`}`).join('\n')}`,
        missingC.length ? `Also answer these story prompts:\n${missingC.map((i) => `- ${i.id}: ${i.text}`).join('\n')}` : 'No stories needed: return "stories": {}.',
      ].join('\n\n') },
    ],
  });
  a.I = { job: out.job, languages: out.languages };
  for (const i of newE) if (out.replies[i.id]) a.E[i.id] = out.replies[i.id];
  for (const i of missingC) if (out.stories[i.id]) a.C[i.id] = out.stories[i.id];
  console.log(`✓ ${p.email}: ${Object.keys(a.E).length} replies, ${Object.values(a.C).filter((v) => String(v).trim()).length} stories, speaks ${out.languages.join('/')}`);
  writeFileSync(FILE, `${JSON.stringify(personas, null, 2)}\n`); // after each persona: a crash keeps the progress
} catch (err) { console.error(`✖ ${p.email}: ${err.message} (re-run to retry)`); } });
await flushUsage();
await mongoose.disconnect();
