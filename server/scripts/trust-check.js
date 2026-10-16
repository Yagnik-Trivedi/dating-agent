// Plan 06 check: rule unit checks, the 6 crafted profiles in seed/trust-cases.json, then the real pipeline
// (mutual like → trust_check → flagged_fake / briefing).
//   node scripts/trust-check.js            all
//   node scripts/trust-check.js --offline  rule checks only (no LLM, no DB)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { KgFact } from '../src/models/KgFact.js';
import { Match } from '../src/models/Match.js';
import { Profile } from '../src/models/Profile.js';
import { User } from '../src/models/User.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { createMatch, matchDetail } from '../src/services/matches.js';
import { statusFor } from '../src/services/pipeline/index.js';
import { checkProfileData } from '../src/services/trust/checkProfile.js';
import { FLAG, ruleChecks, scanMessage } from '../src/services/trust/rules.js';
import { mapLimit } from '../src/utils/mapLimit.js';
import './lib/worker.js'; // job worker for the match pipeline (plan 17)

const cases = JSON.parse(readFileSync(new URL('../seed/trust-cases.json', import.meta.url)));
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));

// --- offline: rules + message scan
const scam = ruleChecks(byId['scammer-daniel'].profile, { accountAgeMinutes: 3 });
assert.ok(scam.contact && scam.money);
assert.deepEqual(scam.flags, [FLAG.noPhotos, FLAG.contact, FLAG.money]);
assert.deepEqual(ruleChecks(byId['clean-ananya'].profile).flags, []);
assert.deepEqual(ruleChecks(byId['mild-dev'].profile).flags, [FLAG.noPhotos, FLAG.thin]);
assert.deepEqual(ruleChecks({ ...byId['clean-rahul'].profile, bio: "I'm 24 and love baking bread every weekend." }).flags, [FLAG.age]);
assert.deepEqual(ruleChecks({ ...byId['clean-rahul'].profile, age: 17 }).flags, [FLAG.age]);
assert.equal(scanMessage('add me on telegram, I can help you invest').severity, 3);
assert.deepEqual(scanMessage('my number is +91 98765 43210').flags, [FLAG.contact]);
assert.equal(scanMessage('please send money urgently, hospital bills').severity, 3);
assert.equal(scanMessage('I work as an investment banker and hate whatsapp groups').severity, 0);
assert.equal(scanMessage('haha that sounds fun, which trek?').severity, 0);
console.log('✓ offline rule checks passed (contact, money, age, thin profile, scanMessage severities)');
if (process.argv.includes('--offline')) process.exit(0);

await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const created = [];
try {
  // --- the 6 crafted profiles
  const results = await mapLimit(cases, 2, (c) => checkProfileData({ profile: c.profile, accountAgeMinutes: c.accountAgeMinutes ?? Infinity }));
  let pass = true;
  for (const [i, c] of cases.entries()) {
    const r = results[i];
    const ok = c.expect.includes(r.level);
    pass &&= ok;
    console.log(`\n${ok ? '✓' : '✖'} ${c.id.padEnd(16)} ${r.level.padEnd(12)} score ${String(r.score).padStart(3)}   expected ${c.expect.join('/')}`);
    if (r.flags.length) console.log(`    flags: ${r.flags.join(' · ')}`);
    for (const k of r.contradictions) console.log(`    ↯ [sev ${k.severity}] ${k.topic}: ${k.a}  vs  "${k.b}"`);
    if (r.clarify.length) console.log(`    clarify: ${r.clarify.join(' | ')}`);
    // Every contradiction carries a quote that appears in the profile (non-verbatim ones are dropped in code).
    assert.ok(r.contradictions.every((k) => k.b?.length > 0));
  }
  const mild = ['mild-meghna', 'mild-dev'].map((id) => results[cases.findIndex((c) => c.id === id)]);
  assert.ok(mild.some((r) => r.clarify.length > 0), 'a mild contradiction should become a clarify topic');
  assert.ok(mild.every((r) => r.level !== 'likely_fake'), 'mild contradictions are never a rejection');
  assert.ok(pass, 'every case should land on its expected level');
  console.log('\n✓ all 6 cases at expected levels; mild contradictions become clarify items, not rejections');

  // --- the real pipeline: mutual like → trust_check → flagged_fake / briefing
  const mkUser = async (name, profile, minutesOld = 60 * 24) => {
    const user = await User.create({
      email: `trust-${name.toLowerCase()}-${Date.now().toString(36)}@check.test`, passwordHash: 'x', name,
      consentAgent: true, consentAt: new Date(), createdAt: new Date(Date.now() - minutesOld * 60_000), onboarding: { status: 'done' },
    });
    await Profile.create({ userId: user._id, ...profile });
    created.push(user._id);
    return user;
  };
  const viewer = await mkUser('Ananya', byId['clean-ananya'].profile);
  const scammer = await mkUser('Daniel', byId['scammer-daniel'].profile, 3);
  const genuine = await mkUser('Rahul', byId['clean-rahul'].profile);

  const waitStatus = async (match, statuses) => {
    for (let i = 0; i < 120; i++) {
      const m = await Match.findById(match._id);
      if (statuses.includes(m.status)) return m;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`match stuck in ${(await Match.findById(match._id)).status}`);
  };

  const [flagged, clean] = await Promise.all([
    waitStatus(await createMatch(viewer._id, scammer._id), ['flagged_fake', 'briefing']),
    waitStatus(await createMatch(viewer._id, genuine._id), ['flagged_fake', 'briefing']),
  ]);
  assert.equal(flagged.status, 'flagged_fake');
  assert.equal(statusFor(flagged, viewer._id), 'flagged_fake');
  assert.equal(statusFor(flagged, scammer._id), 'closed', 'the flagged side must not be told');
  assert.ok(flagged.perUser.every((p) => p.agentActive === false), 'no agent starts on a flagged match');
  const viewerSees = await matchDetail(flagged, viewer._id);
  assert.equal(viewerSees.trust.level, 'likely_fake');
  console.log(`✓ pipeline: Ananya × Daniel → flagged_fake for Ananya (reasons: ${viewerSees.trust.flags.join(' · ')}), "closed" for Daniel, agents off`);
  assert.equal(clean.status, 'briefing');
  assert.ok(['ok', 'caution'].includes(clean.trust[String(viewer._id)].level));
  console.log(`✓ pipeline: Ananya × Rahul → briefing (trust ${clean.trust[String(viewer._id)].level} / ${clean.trust[String(genuine._id)].level})`);
  console.log('\nTrust checks passed.');
} finally {
  await flushUsage();
  await Match.deleteMany({ users: { $in: created } });
  await Profile.deleteMany({ userId: { $in: created } });
  await KgFact.deleteMany({ subjectId: { $in: created } });
  await User.deleteMany({ _id: { $in: created } });
  await mongoose.disconnect();
}
