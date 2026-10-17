// Plan 11A: rewrite chosen seed personas' VOICE to a style spec (seed/restyle-specs.json), keeping facts, values and
// stories' meaning. One mid-tier call per persona, cached by spec hash in seed/.restyle-cache/ (re-runs are free).
//   node scripts/seed/restyle-personas.js [--only seed13,seed14] --yes      then: node scripts/seed/check-personas.js
// Review the personas.json diff by hand before committing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../../src/config/env.js';
import { QUESTIONS } from '../../src/services/kg/questions.js';
import { flushUsage } from '../../src/services/llm/budget.js';
import { chatJSON } from '../../src/services/llm/client.js';
import * as restylePrompt from '../../src/services/prompts/restylePersona.js';
import { mapLimit } from '../../src/utils/mapLimit.js';
import { measure } from './lib/measure.js';

const PROMPT_VERSION = 3;
const FILE = new URL('../../seed/personas.json', import.meta.url);
const SPECS = new URL('../../seed/restyle-specs.json', import.meta.url);
const CACHE = new URL('../../seed/.restyle-cache/', import.meta.url);
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;

const personas = JSON.parse(readFileSync(FILE, 'utf8'));
const specs = JSON.parse(readFileSync(SPECS, 'utf8'));
const E = QUESTIONS.sections.find((s) => s.id === 'E').items;
const todo = personas.filter((p) => specs[p.email] && (!only || only.some((o) => p.email.startsWith(o))));
// Keyed by the spec alone: an unchanged spec reuses its cached output, so a re-run never restyles a restyle.
const hashOf = (p, spec) => createHash('sha1').update(JSON.stringify({ v: PROMPT_VERSION, email: p.email, spec })).digest('hex').slice(0, 12);

const schema = z.object({
  replies: z.record(z.string(), z.string().trim().min(1).max(400)).catch({}),
  stories: z.record(z.string(), z.string().trim().min(1).max(600)).catch({}),
  profile: z.object({ bio: z.string().trim().min(1).max(300), prompts: z.array(z.object({ q: z.string(), a: z.string().trim().min(1).max(300) })) }).nullable().catch(null),
});

console.log(`${todo.length} persona(s) to restyle, ≤ ${todo.length} mid-tier calls (cached ones are free).`);
if (!args.includes('--yes')) process.exit(0);
mkdirSync(CACHE, { recursive: true });
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 }); // usage log

let failed = 0;
/** What the measured replies miss vs the spec: each non-English language at >= half its target share (min 0.12), terse limits. */
function shortfall(spec, replies) {
  const m = measure({ answers: { E: replies } });
  const out = [];
  for (const [l, t] of Object.entries(spec.mix ?? {})) {
    if (l === 'en') continue;
    const want = Math.max(0.12, t / 2);
    if ((m.mix[l] ?? 0) < want) out.push(`only ${Math.round((m.mix[l] ?? 0) * 100)}% of the words are ${l}; aim for ~${Math.round(t * 100)}%, in at least 10 of the 15 replies.`);
  }
  if (spec.terseness === 'terse' && !(m.avgWords <= 6 && m.endPunct < 0.3)) out.push(`replies average ${m.avgWords.toFixed(1)} words and ${Math.round(m.endPunct * 100)}% end with punctuation; keep every reply to 1-5 words with no full stop.`);
  return out;
}
await mapLimit(todo, 2, async (p) => {
  const spec = specs[p.email];
  const file = new URL(`${p.email.replace(/@.*/, '')}-${hashOf(p, spec)}.json`, CACHE);
  let out;
  if (existsSync(file)) out = JSON.parse(readFileSync(file, 'utf8'));
  else {
    const storyIds = spec.stories || spec.relocate ? Object.keys(p.answers.C ?? {}) : [];
    const call = (feedback) => chatJSON({
      tier: 'mid', reasoning: false, temperature: 0.8, schema, purpose: 'seed-restyle',
      messages: restylePrompt.build({
        name: p.profile.name, spec, feedback,
        replies: spec.keepVoice ? [] : E.map((i) => ({ id: i.id, incoming: i.text, text: p.answers.E?.[i.id] ?? '' })),
        stories: storyIds.map((id) => ({ id, text: p.answers.C[id] })),
        profile: spec.relocate ? { bio: p.profile.bio, prompts: p.profile.prompts ?? [] } : null,
      }),
    });
    // Measure with the same code as check-personas; one retry with the measured shortfall (v1: "~40% Hindi" came back ~5%).
    const misses = (o) => (spec.keepVoice ? [] : shortfall(spec, o.replies));
    try {
      out = await call(null);
      const first = misses(out);
      if (first.length) {
        console.warn(`  ${p.email}: retrying (${first.join('; ')})`);
        const second = await call(first.join(' '));
        if (misses(second).length < first.length) out = second;
      }
    } catch (err) { failed++; return console.error(`✗ ${p.email}: ${err.message}`); }
    const missing = spec.keepVoice ? [] : E.map((i) => i.id).filter((id) => !out.replies[id]);
    if (missing.length) { failed++; return console.error(`✗ ${p.email}: replies missing ${missing.join(', ')}`); }
    const left = misses(out);
    if (left.length) console.warn(`  ${p.email}: still short after the retry (${left.join('; ')}); hand-fix it`);
    writeFileSync(file, JSON.stringify(out, null, 2));
  }
  if (!spec.keepVoice) p.answers.E = Object.fromEntries(E.map((i) => [i.id, out.replies[i.id]]));
  for (const [id, text] of Object.entries(out.stories ?? {})) if (p.answers.C?.[id]) p.answers.C[id] = text;
  if (spec.relocate) {
    if (out.profile) { p.profile.bio = out.profile.bio; if (out.profile.prompts?.length === p.profile.prompts?.length) p.profile.prompts = out.profile.prompts; }
    p.profile.city = spec.relocate;
  }
  console.log(`✓ ${p.email} (${p.profile.name})${spec.relocate ? ` → ${spec.relocate}` : ''}: ${p.answers.E.e2}`);
});

writeFileSync(FILE, `${JSON.stringify(personas, null, 2)}\n`);
console.log(`\nWrote seed/personas.json${failed ? `; ${failed} persona(s) failed (re-run to retry)` : ''}. Next: node scripts/seed/check-personas.js`);
await flushUsage();
await mongoose.disconnect();
