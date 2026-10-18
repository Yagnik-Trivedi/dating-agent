// Tavily has 1,000 credits in total: date ideas search at most TAVILY_MAX_SEARCHES times per database and
// TAVILY_SEARCHES_PER_USER_DAY per user; repeats come from the cache; over a cap, cached ideas for my city or a 503.
// Never calls Tavily or an LLM: the search is stubbed and LLM_ENABLED=false makes the idea writer fall back to raw results.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Profile } from '../src/models/Profile.js';
import { SearchCache } from '../src/models/SearchCache.js';
import { Usage } from '../src/models/Usage.js';
import { dateIdeasFor } from '../src/services/tavily/dateIdeas.js';
import { start, stop } from '../scripts/lib/testDb.js';

before(start);
after(stop);

test('one search per new query, cache after that, caps fall back to my city\'s cached ideas, then 503', async () => {
  const saved = { LLM_ENABLED: env.LLM_ENABLED, TAVILY_MAX_SEARCHES: env.TAVILY_MAX_SEARCHES, TAVILY_SEARCHES_PER_USER_DAY: env.TAVILY_SEARCHES_PER_USER_DAY };
  Object.assign(env, { LLM_ENABLED: false, TAVILY_MAX_SEARCHES: 2, TAVILY_SEARCHES_PER_USER_DAY: 5 });
  try {
    const [a, b, c] = [1, 2, 3].map(() => new mongoose.Types.ObjectId());
    await Profile.create([{ userId: a, name: 'A', city: 'Pune', tags: { interests: ['treks', 'cafes'] } }, { userId: c, name: 'C', city: 'Delhi', tags: { interests: ['art'] } }]);
    let calls = 0;
    const search = async (q) => { calls++; return [{ title: `spot for ${q}`, url: `https://example.com/${calls}`, content: 'nice' }]; };
    const match = { _id: new mongoose.Types.ObjectId(), users: [a, b], perUser: [] };

    const first = await dateIdeasFor(match, a, { search });
    assert.equal(first.cached, false);
    assert.match((await SearchCache.findOne().lean()).query, /^cafes and treks spots for a first date in pune$/, 'interests sorted');
    assert.equal((await dateIdeasFor(match, a, { search })).cached, true);
    assert.equal(calls, 1);
    assert.equal(await Usage.countDocuments({ tier: 'search' }), 1);

    // All-time cap reached (2): a new query in Pune gets Pune's cached ideas; Delhi has none → 503.
    await Usage.create({ purpose: 'tavily-search', tier: 'search', provider: 'tavily', ok: true });
    await Profile.updateOne({ userId: a }, { $set: { 'tags.interests': ['music'] } });
    const near = await dateIdeasFor(match, a, { search });
    assert.deepEqual([near.cached, near.nearby, calls], [true, true, 1]);
    await assert.rejects(dateIdeasFor({ ...match, users: [c, b] }, c, { search }), (e) => e.code === 'DATE_IDEAS_UNAVAILABLE');

    // Per-user daily cap: A already searched today, so a new query gets Pune's cached ideas without a search.
    Object.assign(env, { TAVILY_MAX_SEARCHES: 100, TAVILY_SEARCHES_PER_USER_DAY: 1 });
    await Profile.updateOne({ userId: a }, { $set: { 'tags.interests': ['dance'] } });
    assert.deepEqual([(await dateIdeasFor(match, a, { search })).nearby, calls], [true, 1]);
  } finally {
    Object.assign(env, saved);
  }
});
