// Date ideas: shared city + top 2 shared interests → Tavily search → 3 ideas (fast tier). Cached by query for 7 days.
import { tavily } from '@tavily/core';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { Profile } from '../../models/Profile.js';
import { KgFact } from '../../models/KgFact.js';
import { SearchCache } from '../../models/SearchCache.js';
import { httpError } from '../../utils/http.js';
import { chatJSON } from '../llm/client.js';
import { otherUserId } from '../matches.js';
import * as dateIdeasPrompt from '../prompts/dateIdeas.js';

const ideasSchema = z.object({
  ideas: z.array(z.object({ title: z.string().trim().min(1).max(120), why: z.string().trim().max(240).catch(''), link: z.string().trim() })).default([]),
});

async function tavilySearch(query) {
  if (!env.TAVILY_API_KEY) throw httpError(503, 'DATE_IDEAS_UNAVAILABLE', 'Date ideas need TAVILY_API_KEY on the server');
  const { results } = await tavily({ apiKey: env.TAVILY_API_KEY }).search(query, { maxResults: 5 });
  return results;
}

/** The search query for a viewer: "<interest> and <interest> spots for a first date in <city>". */
export async function dateQuery(match, viewerId) {
  const viewer = String(viewerId);
  // Only my own data (plan 07/09 boundary): my city + what my agent's notes say they like, from the transcript.
  const [mine, notes] = await Promise.all([
    Profile.findOne({ userId: viewer }, { city: 1, tags: 1 }).lean(),
    KgFact.find({ matchId: match._id, observerId: viewer, predicate: 'likes', polarity: { $ne: -1 } }, { object: 1, confidence: 1 }).sort({ confidence: -1 }).limit(2).lean(),
  ]);
  const city = mine?.city || 'India';
  const interests = (notes.length ? notes.map((n) => n.object) : mine?.tags?.interests ?? []).slice(0, 2);
  return { city, interests, query: `${interests.join(' and ') || 'cafes and walks'} spots for a first date in ${city}`.toLowerCase() };
}

/** → { ideas: [{ title, why, link }], icebreakers, cached }. `search` is injectable for tests. */
export async function dateIdeasFor(match, viewerId, { search = tavilySearch } = {}) {
  const { city, interests, query } = await dateQuery(match, viewerId);
  const icebreakers = match.report?.[String(viewerId)]?.icebreakers ?? [];
  const hit = await SearchCache.findOne({ query }).lean();
  if (hit) {
    console.log(`date-ideas: cache hit for "${query}"`);
    return { ideas: hit.ideas, icebreakers, cached: true };
  }
  const results = (await search(query)).filter((r) => r.url);
  const out = await chatJSON({ tier: 'fast', schema: ideasSchema, purpose: 'date-ideas', userId: viewerId, matchId: match._id, messages: dateIdeasPrompt.build({ city, interests, results }) });
  const urls = new Set(results.map((r) => r.url));
  const ideas = out.ideas.filter((i) => urls.has(i.link)).slice(0, 3); // only links that came from the search
  if (ideas.length) await SearchCache.updateOne({ query }, { $setOnInsert: { query, ideas } }, { upsert: true });
  console.log(`date-ideas: searched "${query}" → ${ideas.length} ideas`);
  return { ideas, icebreakers, cached: false };
}
