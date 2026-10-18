// Plan 12 §5/§7: pre-baked judge accounts (`node scripts/seed.js --judges`, after the personas are seeded).
// Each judge copies a seed persona's onboarding answers (seed/judges.json) and gets a real graph, then real engine runs
// against the seeds in its gate pool produce the demo states: a flagged fake, a match frozen mid-conversation (resumed
// when the judge opens it) and finished verdicts — whichever of Compatible / Maybe / Not compatible the judges reach.
// Nothing is hand-written: a state no run reached is reported as missing. Idempotent: a partner the judge already has a
// match with is never re-run (delete that match to redo it). On a Compatible or Maybe the seed side presses Continue, so
// the judge's own Continue hands off and shows the reveal.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from '../../src/config/env.js';
import { KgFact } from '../../src/models/KgFact.js';
import { Match } from '../../src/models/Match.js';
import { Message } from '../../src/models/Message.js';
import { Profile } from '../../src/models/Profile.js';
import { User } from '../../src/models/User.js';
import { cancelReplies } from '../../src/services/agent/index.js';
import { decide } from '../../src/services/compat/index.js';
import { buildUserGraph } from '../../src/services/kg/buildUserGraph.js';
import { buildGate, discoverQuery } from '../../src/services/match/gate.js';
import { createMatch } from '../../src/services/matches.js';
import { runPair } from '../lib/runPair.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../../seed/${f}`, import.meta.url)));
const LIVE_MESSAGES = 6; // the frozen match stops here; the judge watches the next turns
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATE = { compatible: 'compatible', maybe: 'maybe', incompatible: 'incompatible', closed: 'incompatible', flagged_fake: 'flagged_fake' };

async function upsertJudge(spec, base, passwordHash, log) {
  const hash = createHash('sha1').update(JSON.stringify({ spec, answers: base.answers, profile: base.profile })).digest('hex').slice(0, 16);
  const user = await User.findOneAndUpdate(
    { email: spec.email },
    { $set: { name: spec.name, agentMode: 'shadow', isJudge: true, isSeed: false, consentAgent: true, 'onboarding.answers': base.answers, ...(env.JUDGE_PASSWORD && { passwordHash }) },
      // Without JUDGE_PASSWORD the random hash is for new accounts only: a re-run never breaks the login shared in Devpost.
      $setOnInsert: { consentAt: new Date(), 'onboarding.status': 'processing', ...(!env.JUDGE_PASSWORD && { passwordHash }) } },
    { upsert: true, new: true, runValidators: true },
  );
  const profile = { ...base.profile, name: spec.name, photos: [`https://api.dicebear.com/9.x/notionists/svg?seed=${spec.name}`] };
  await Profile.updateOne({ userId: user._id }, { $set: { userId: user._id, ...profile } }, { upsert: true });
  await buildGate(user._id);
  if (user.seedHash !== hash || !(await KgFact.exists({ subjectId: user._id, observerId: null, source: 'questionnaire_choice' }))) {
    log(`  building ${spec.name}'s graph (copy of ${base.profile.name})…`);
    await buildUserGraph(user._id);
    await User.updateOne({ _id: user._id }, { $set: { seedHash: hash } });
  }
  return User.findById(user._id);
}

/** Run until LIVE_MESSAGES messages, then freeze. → final status (agent_chatting when frozen). */
async function runLive(judge, partner, log) {
  const match = await createMatch(judge._id, partner._id);
  const t0 = Date.now();
  for (;;) {
    await sleep(2000);
    const { status } = await Match.findById(match._id, { status: 1 }).lean();
    const n = await Message.countDocuments({ matchId: match._id });
    const timedOut = Date.now() - t0 > 20 * 60_000;
    if (status === 'agent_chatting' && (n >= LIVE_MESSAGES || (timedOut && n > 0))) {
      await Match.updateOne({ _id: match._id }, { $set: { 'agentState.frozen': true } });
      cancelReplies(match._id); // a reply being written is discarded by the pre-send re-check (frozen)
      log(`  live: frozen at ${n} messages after ${Math.round((Date.now() - t0) / 1000)} s`);
      return 'live';
    }
    if (!['matched', 'trust_check', 'briefing', 'agent_chatting'].includes(status) || timedOut) return status;
  }
}

/** → { [judgeEmail]: { states: { live, flagged_fake, compatible, maybe, incompatible: partner name }, missing: [] } } */
export async function seedJudges({ passwordHash, log = console.log }) {
  // This process seeds, it doesn't serve judges: the per-user caps would stop the runs halfway.
  Object.assign(env, { AGENT_DEBOUNCE_MS: 0, AGENT_MIN_DELAY_MS: 0, AGENT_MAX_DELAY_MS: 0, JUDGE_LIVE_CHATS_PER_DAY: 1e6, LLM_DAILY_CALLS_PER_USER: 1e6 });
  const personas = read('personas.json');
  const fakes = new Set(read('pairs.json').filter((p) => p.expected === 'flagged_fake').map((p) => p.b));
  const report = {};
  for (const spec of read('judges.json')) {
    const base = personas.find((p) => p.email === spec.base);
    if (!base) throw new Error(`judges.json: base persona ${spec.base} not found`);
    log(`\n${spec.name} (${spec.email})`);
    const judge = await upsertJudge(spec, base, passwordHash, log);
    const me = await Profile.findOne({ userId: judge._id }, { gate: 1 }).lean();
    const seeds = await User.find({ isSeed: true }, { email: 1, name: 1 }).lean();
    const pool = (await Profile.find({ ...discoverQuery(me.gate, [judge._id]), userId: { $in: seeds.map((s) => s._id) } }, { userId: 1 }).lean())
      .map((p) => seeds.find((s) => String(s._id) === String(p.userId))).sort((a, b) => a.email.localeCompare(b.email));
    const states = {};
    for (const m of await Match.find({ users: judge._id }).lean()) {
      const partner = seeds.find((s) => m.users.some((u) => String(u) === String(s._id)));
      const state = m.status === 'agent_chatting' && m.agentState?.frozen ? 'live' : STATE[m.status];
      if (state && partner) states[state] ??= partner.name;
    }
    const matched = new Set((await Match.find({ users: judge._id }, { users: 1 }).lean()).flatMap((m) => m.users.map(String)));
    const free = pool.filter((s) => !matched.has(String(s._id)));

    const fake = free.find((s) => fakes.has(s.email));
    if (fake && !states.flagged_fake) {
      log(`  fake: ${fake.name}`);
      const { match } = await runPair(judge, fake, { log: () => {} });
      if (STATE[match.status] === 'flagged_fake') states.flagged_fake = fake.name;
      log(`  → ${match.status}`);
    }
    const real = free.filter((s) => !fakes.has(s.email));
    if (!states.live && real.length) {
      const partner = real.pop();
      log(`  live: ${partner.name}`);
      const s = await runLive(judge, partner, log);
      if (s === 'live') states.live = partner.name;
      else log(`  → ended early (${s}); no frozen match`);
    }
    for (const partner of real) {
      if (states.compatible && states.maybe && states.incompatible) break;
      log(`  full run: ${partner.name}`);
      const { match, messages, seconds } = await runPair(judge, partner, { log: () => {} });
      const state = STATE[match.status];
      log(`  → ${match.status} (${messages.length} messages, ${seconds} s)`);
      if (state && !states[state]) states[state] = partner.name;
      if (['compatible', 'maybe'].includes(match.status)) await decide(match._id, partner._id, 'continue');
    }
    const missing = ['flagged_fake', 'live', 'compatible', 'maybe', 'incompatible'].filter((s) => !states[s]);
    report[spec.email] = { states, missing };
    log(`  states: ${JSON.stringify(states)}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
  }
  return report;
}
