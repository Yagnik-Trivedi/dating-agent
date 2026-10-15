// Plan 09 checks. Offline: verdict math, dimensions. Live (needs the personas; run simulate first):
//   node scripts/simulate.js seed01@demo.local seed04@demo.local     designed compatible pair → compatible
//   node scripts/compat-check.js                                    dealbreaker pair, handoff + reveal, override, date ideas, smart-call count
//   node scripts/compat-check.js --offline
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Match } from '../src/models/Match.js';
import { Message } from '../src/models/Message.js';
import { SearchCache } from '../src/models/SearchCache.js';
import { Usage } from '../src/models/Usage.js';
import { User } from '../src/models/User.js';
import { lowerVerdict, verdictFor } from '../src/services/compat/config.js';
import { communicationDim, interestsDim } from '../src/services/compat/evaluate.js';
import { decide, revealFor } from '../src/services/compat/index.js';
import { flushUsage } from '../src/services/llm/budget.js';
import { createMatch } from '../src/services/matches.js';
import { dateIdeasFor } from '../src/services/tavily/dateIdeas.js';
import { ensurePersona } from './lib/personas.js';

// --- offline
const dims = (s, c = 0.7, db = 1) => ({ dealbreakers: { score: db, confidence: 0.9 }, valuesGoals: { score: s, confidence: c }, lifestyle: { score: s, confidence: c }, interests: { score: s, confidence: c }, communication: { score: s, confidence: c }, personality: { score: s, confidence: 0.3 } });
assert.equal(verdictFor({ dimensions: dims(0.9), chemistry: 0.8 }).verdict, 'compatible');
assert.equal(verdictFor({ dimensions: dims(0.9, 0.3), chemistry: 0.8 }).verdict, 'maybe', 'low confidence is never a confident verdict');
assert.equal(verdictFor({ dimensions: dims(0.3), chemistry: 0.3 }).verdict, 'incompatible');
assert.equal(verdictFor({ dimensions: dims(0.6), chemistry: 0.6 }).verdict, 'maybe');
assert.equal(verdictFor({ dimensions: dims(1, 1, 0), chemistry: 1 }).verdict, 'incompatible', 'dealbreaker is a hard gate');
assert.equal(verdictFor({ dimensions: dims(0.8), chemistry: 0.5 }).score, 0.77);
assert.equal(lowerVerdict('compatible', 'maybe'), 'maybe');
assert.equal(lowerVerdict('incompatible', 'compatible'), 'incompatible');
const msg = (text, authoredBy = 'agent') => ({ text, authoredBy });
const balanced = communicationDim([msg('hey how was the trek?'), msg('nice, which one is your favourite?')], [msg('so good! did rajmachi, you?'), msg('rajmachi for sure, have you been?')]);
const oneSided = communicationDim([msg('hey how was the trek? tell me everything about it please'), msg('which one is your favourite and why?')], [msg('ok'), msg('fine')]);
assert.ok(balanced.score > oneSided.score && balanced.score > 0.8, `balanced ${balanced.score} vs one-sided ${oneSided.score}`);
assert.deepEqual(communicationDim([], []), { score: 0.5, confidence: 0 });
const v = (x, y) => [x, y];
const interests = interestsDim(
  [{ predicate: 'likes', object: 'trekking', weight: 0.9, embedding: v(1, 0) }, { predicate: 'likes', object: 'reading', weight: 0.3, embedding: v(0, 1) }],
  [{ predicate: 'likes', object: 'hiking', confidence: 0.6, embedding: v(0.95, 0.1) }],
);
assert.equal(interests.score, 0.75, 'weighted by how much the viewer cares');
console.log('✓ offline checks passed (verdict rule + gate + confidence, lower verdict, communication, interests)');
if (process.argv.includes('--offline')) process.exit(0);

// --- live
Object.assign(env, { AGENT_DEBOUNCE_MS: 0, AGENT_MIN_DELAY_MS: 0, AGENT_MAX_DELAY_MS: 0 });
await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitStatus = async (id, statuses, secs = 900) => {
  for (let i = 0; i < secs; i++) {
    const m = await Match.findById(id);
    if (statuses.includes(m.status)) return m;
    await sleep(1000);
  }
  throw new Error(`match stuck in ${(await Match.findById(id)).status}`);
};
try {
  const [meera, kabir, ishaan] = [await ensurePersona('seed01@demo.local'), await ensurePersona('seed03@demo.local'), await ensurePersona('seed04@demo.local')];

  // 1. Designed compatible pair (from the simulate run): verdict, receipts, exactly one smart call per viewer.
  const good = await Match.findOne({ users: { $all: [meera._id, ishaan._id] } });
  assert.ok(good?.report, 'simulate seed01 × seed04 first');
  const ids = new Set((await Message.find({ matchId: good._id }, { _id: 1 }).lean()).map((m) => String(m._id)));
  for (const r of Object.values(good.report)) {
    assert.ok([...r.reasons, ...r.concerns.filter((c) => c.messageIds.length)].every((x) => x.messageIds.length && x.messageIds.every((id) => ids.has(id))), 'every receipt is a real message');
  }
  const verdicts = Object.values(good.report).map((r) => r.verdict);
  console.log(`✓ Meera × Ishaan: ${verdicts.join(' / ')} → status ${good.status}; every reason cites real messages`);
  const smart = await Usage.countDocuments({ matchId: good._id, tier: 'smart' });
  assert.equal(smart, 2, 'one smart call per viewer');
  console.log('✓ exactly 1 smart-tier call per viewer (2 for the match)');

  // 2. Both continue → handed_off + reveal.
  if (['compatible', 'maybe'].includes(good.status)) {
    await decide(good._id, meera._id, 'continue');
    const after = await decide(good._id, ishaan._id, 'continue');
    assert.equal(after.status, 'handed_off');
    assert.ok(after.perUser.every((p) => !p.agentActive));
    const reveal = await revealFor(after);
    assert.match(reveal.text, /^The first \d+ messages were handled by your agents/);
    console.log(`✓ both continue → handed_off; reveal: "${reveal.text}"`);

    // 3. Date ideas: 3 items, second call served from the cache (search stubbed unless TAVILY_API_KEY is set).
    const fake = async () => [
      { title: 'Rajmachi Fort trek', url: 'https://example.test/rajmachi', content: 'Popular monsoon trek near Lonavala with sunrise views.' },
      { title: 'Pagdandi Books Chai Cafe', url: 'https://example.test/pagdandi', content: 'Bookstore cafe in Baner with chai and quiet corners.' },
      { title: 'Sinhagad sunrise hike', url: 'https://example.test/sinhagad', content: 'Short hike with famous pithla bhakri at the top.' },
      { title: 'Cooking class at Kalyani Nagar', url: 'https://example.test/cooking', content: 'Weekend Maharashtrian cooking workshop for two.' },
    ];
    const search = env.TAVILY_API_KEY ? undefined : fake;
    const handed = await Match.findById(good._id);
    await SearchCache.deleteMany({});
    const first = await dateIdeasFor(handed, meera._id, { search });
    const second = await dateIdeasFor(handed, meera._id, { search: async () => { throw new Error('should be cached'); } });
    assert.equal(first.ideas.length, 3);
    assert.ok(second.cached && second.ideas.length === 3);
    console.log(`✓ date ideas (${env.TAVILY_API_KEY ? 'Tavily' : 'stubbed search: no TAVILY_API_KEY'}): ${first.ideas.map((i) => i.title).join(' · ')}; second call hit the cache`);
  } else {
    console.log(`(skipping handoff + date ideas: Meera × Ishaan ended ${good.status})`);
  }

  // 4. Designed dealbreaker pair → incompatible, one wind-down in Meera's style, closed. Then override reopens it.
  const old = await Match.findOne({ users: { $all: [meera._id, kabir._id] } });
  if (old) { await Message.deleteMany({ matchId: old._id }); await old.deleteOne(); }
  await User.updateMany({ _id: { $in: [meera._id, kabir._id] } }, { $set: { agentMode: 'auto' } });
  const bad = await waitStatus((await createMatch(meera._id, kabir._id))._id, ['closed', 'incompatible', 'flagged_fake']);
  const mr = bad.report[String(meera._id)];
  assert.equal(mr.verdict, 'incompatible');
  assert.equal(mr.dimensions.dealbreakers.score, 0);
  const winds = await Message.find({ matchId: bad._id }).lean();
  assert.equal(winds.length, 1, 'exactly one wind-down message');
  assert.equal(String(winds[0].senderId), String(meera._id));
  assert.equal(winds[0].authoredBy, 'agent');
  assert.equal(bad.status, 'closed');
  console.log(`✓ Meera × Kabir: incompatible (${mr.concerns[0]?.text}); wind-down from Meera's agent: "${winds[0].text}"; closed`);
  const reopened = await decide(bad._id, meera._id, 'continue');
  assert.equal(reopened.status, 'maybe');
  assert.equal(reopened.perUser.find((p) => String(p.userId) === String(meera._id)).agentActive, false);
  console.log('✓ "Talk anyway" override reopens the match (status maybe, her agent off)');
  console.log('\nCompatibility checks passed.');
} finally {
  await flushUsage();
  await mongoose.disconnect();
}
