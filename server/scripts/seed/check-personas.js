// Plan 11A: measure seed/personas.json against seed/persona-quotas.json. Pure code (no DB, no LLM): language mix and
// script via the voice-sample heuristic, texting style from the E replies, city + gate coverage, labelled pairs.
//   node scripts/seed/check-personas.js [--personas seed/personas.json]   → table; exit 1 if any quota fails
import { readFileSync } from 'node:fs';
import { tagLanguageHeuristic } from '../../src/services/kg/language.js';
import { gateFrom, GATE_ATTRIBUTES, passesGate } from '../../src/services/match/gate.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = new URL('../../', import.meta.url);
const personas = JSON.parse(readFileSync(new URL(arg('--personas', 'seed/personas.json'), root), 'utf8'));
const pairs = JSON.parse(readFileSync(new URL('seed/pairs.json', root), 'utf8'));
const Q = JSON.parse(readFileSync(new URL('seed/persona-quotas.json', root), 'utf8'));
const EMOJI = /\p{Extended_Pictographic}/gu;
const kindOf = (p) => (p.designNotes ?? '').match(/^(fake|thin|mild|normal):/)?.[1] ?? 'normal';

/** Measured voice of one persona: language shares, code-switching, style tags. */
export function measure(p) {
  const e = Object.values(p.answers?.E ?? {}).filter((t) => String(t).trim());
  const n = e.length || 1;
  const mix = {};
  let switches = 0;
  for (const t of e) {
    const tag = tagLanguageHeuristic(t);
    if (tag.codeSwitch) switches++;
    for (const [l, v] of Object.entries(tag.shares)) mix[l] = (mix[l] ?? 0) + v / n;
  }
  const words = e.map((t) => t.split(/\s+/).filter(Boolean).length);
  const avgWords = words.reduce((a, b) => a + b, 0) / n;
  const emoji = e.reduce((k, t) => k + (t.match(EMOJI)?.length ?? 0), 0) / n;
  const endPunct = e.filter((t) => /[.!?]["')\]]?$/.test(t.trim())).length / n;
  const caps = e.filter((t) => /^\p{Lu}/u.test(t.trim())).length / n;
  const styles = [
    avgWords <= 6 && endPunct < 0.3 && 'terse', emoji >= 0.8 && 'emoji', avgWords >= 18 && 'long',
    caps >= 0.8 && endPunct >= 0.7 && emoji < 0.2 && 'formal',
  ].filter(Boolean);
  const langs = Object.entries(mix).filter(([, v]) => v >= Q.languageShareMin).map(([l]) => l);
  return { mix, langs, switches, avgWords, emoji, styles };
}

// The typical new user: the most common B answer per attribute, no dealbreakers.
const common = {};
for (const k of GATE_ATTRIBUTES) {
  const c = {};
  personas.forEach((p) => { const a = p.answers?.B?.[k]?.answer; if (a) c[a] = (c[a] ?? 0) + 1; });
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) common[k] = { answer: top, importance: 'medium', dealbreaker: false };
}
const gateOf = (p) => gateFrom(p.profile, p.answers?.B ?? {});
const byEmail = new Map(personas.map((p) => [p.email, p]));

const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); return ok ? '✓' : '✗'; };

// Per persona.
const rows = personas.map((p) => ({ p, m: measure(p) }));
console.log('persona            city       sex   into        kind    langs                     sw   words emoji styles');
for (const { p, m } of rows) {
  const langs = Object.entries(m.mix).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).map(([l, v]) => `${l}:${v.toFixed(2)}`).join(' ');
  console.log(`${p.email.padEnd(18)} ${p.profile.city.padEnd(10)} ${p.profile.gender.padEnd(5)} ${(p.profile.interestedIn ?? []).join('/').padEnd(11)} ${kindOf(p).padEnd(7)} ${langs.padEnd(25)} ${String(m.switches).padStart(2)}  ${m.avgWords.toFixed(1).padStart(5)} ${m.emoji.toFixed(1).padStart(5)} ${m.styles.join(',')}`);
}

// Languages + code-switching + styles.
console.log('\nQuota                                   have  min');
for (const [key, q] of Object.entries(Q.languages)) {
  const have = rows.filter(({ m }) => key.split('|').some((l) => m.langs.includes(l))).length;
  console.log(`${check(have >= q.min, `language ${q.label}: ${have} < ${q.min}`)} ${q.label.padEnd(37)} ${String(have).padStart(4)} ${String(q.min).padStart(4)}`);
}
const cs = rows.filter(({ m }) => m.switches >= 3).length;
console.log(`${check(cs >= Q.codeSwitchPersonas.min, `code-switching personas: ${cs} < ${Q.codeSwitchPersonas.min}`)} ${'code-switching personas'.padEnd(37)} ${String(cs).padStart(4)} ${String(Q.codeSwitchPersonas.min).padStart(4)}`);
for (const [s, q] of Object.entries(Q.styles)) {
  const have = rows.filter(({ m }) => m.styles.includes(s)).length;
  console.log(`${check(have >= q.min, `style ${s}: ${have} < ${q.min}`)} ${`style: ${s}`.padEnd(37)} ${String(have).padStart(4)} ${String(q.min).padStart(4)}`);
}

// Cities + gate coverage for typical new users.
console.log('\nCity        personas  ' + Q.cities.newUsers.map((u) => `new ${u.gender} sees`.padEnd(16)).join(''));
const outside = personas.filter((p) => !Q.cities.demo.includes(p.profile.city));
check(!outside.length, `personas outside the demo cities: ${outside.map((p) => `${p.email} (${p.profile.city})`).join(', ')}`);
for (const city of Q.cities.demo) {
  const here = personas.filter((p) => p.profile.city === city);
  const cells = Q.cities.newUsers.map((u) => {
    const me = gateFrom({ ...u, city }, common);
    const seen = here.filter((p) => kindOf(p) !== 'fake' && passesGate(me, gateOf(p)));
    return `${check(seen.length >= Q.cities.minVisibleSeedsPerNewUser, `${city}: a new ${u.gender} sees ${seen.length} seeds`)} ${seen.length} (${seen.map((p) => p.email.replace(/@.*/, '').replace('seed', '')).join(',')})`.padEnd(16);
  });
  console.log(`${city.padEnd(11)} ${check(here.length >= Q.cities.minPersonasPerCity, `${city}: ${here.length} personas`)} ${String(here.length).padStart(2)}      ${cells.join('')}`);
}
if (outside.length) console.log(`✗ outside the demo cities: ${outside.map((p) => `${p.email.replace(/@.*/, '')} (${p.profile.city})`).join(', ')}`);

// Labelled pairs: same city, gate passes (or must fail for 'gated').
console.log('\nPairs');
for (const pr of pairs) {
  const a = byEmail.get(pr.a), b = byEmail.get(pr.b);
  if (!a || !b) { console.log(`${check(false, `pair ${pr.id}: persona missing`)} ${pr.id} missing persona`); continue; }
  const pass = passesGate(gateOf(a), gateOf(b));
  const ok = pr.expected === 'gated' ? !pass : pass;
  const why = a.profile.city !== b.profile.city ? ` (cities ${a.profile.city} ≠ ${b.profile.city})` : '';
  console.log(`${check(ok, `pair ${pr.id} (${pr.expected}): gate ${pass ? 'passes' : 'fails'}${why}`)} ${pr.id.padEnd(3)} ${pr.expected.padEnd(13)} gate ${pass ? 'passes' : 'fails '}${why}`);
}

console.log(fails.length ? `\n${fails.length} quota check(s) failed:\n- ${fails.join('\n- ')}` : '\nAll persona quotas pass.');
process.exitCode = fails.length ? 1 : 0;
