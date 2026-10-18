// Date ideas (plan 09 §4): MY top 2 shared_interest moments + MY city → Tavily search → 3 ideas (fast tier). Cached by
// query for 30 days. Only my own data: the other user's Profile and graph are never read.
// Tavily budget (1,000 credits in total): basic depth (1 credit), an all-time cap and a per-user daily cap counted as
// Usage rows (tier 'search'); over a cap, ideas already cached for my city, else the 503.
import { tavily } from '@tavily/core';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { Profile } from '../../models/Profile.js';
import { ChatEvent } from '../../models/ChatEvent.js';
import { SearchCache } from '../../models/SearchCache.js';
import { Usage } from '../../models/Usage.js';
import { httpError } from '../../utils/http.js';
import { chatJSON } from '../llm/client.js';
import { asActor } from '../actor.js';
import { myDecision } from '../compat/report.js';
import { otherUserId } from '../matches.js';
import * as dateIdeasPrompt from '../prompts/dateIdeas.js';
import { debug } from '../../utils/log.js';

const ideasSchema = z.object({
  ideas: z.array(z.object({ title: z.string().trim().min(1).max(120), why: z.string().trim().max(240).catch(''), link: z.string().trim() })).default([]),
});

async function tavilySearch(query) {
  if (!env.TAVILY_API_KEY) throw httpError(503, 'DATE_IDEAS_UNAVAILABLE', 'Date ideas need TAVILY_API_KEY on the server');
  const { results } = await tavily({ apiKey: env.TAVILY_API_KEY }).search(query, { maxResults: 5, searchDepth: 'basic' });
  return results;
}

/** The search query for a viewer: "<interest> and <interest> spots for a first date in <city>". */
export async function dateQuery(match, viewerId) {
  const viewer = String(viewerId);
  const [mine, events] = await Promise.all([
    Profile.findOne({ userId: viewer }, { city: 1, tags: 1 }).lean(),
    ChatEvent.find({ matchId: match._id, observerId: viewer, type: 'shared_interest' }, { label: 1, weight: 1 }).sort({ weight: -1 }).lean(),
  ]);
  const city = mine?.city || 'India';
  const shared = [...new Set(events.map((e) => e.label?.trim().toLowerCase()).filter(Boolean))];
  // Sorted, so "cafes and treks" and "treks and cafes" share one cached search.
  const interests = (shared.length ? shared : mine?.tags?.interests ?? []).slice(0, 2).map((x) => String(x).toLowerCase()).sort();
  return { city, interests, query: `${interests.join(' and ') || 'cafes and walks'} spots for a first date in ${city}`.toLowerCase() };
}

/** Why a new search isn't allowed right now, or null. Failed searches count too: Tavily may still bill them. */
export async function overBudget(userId) {
  const since = new Date(Date.now() - 86_400_000);
  const [all, mine] = await Promise.all([
    Usage.countDocuments({ tier: 'search' }),
    Usage.countDocuments({ tier: 'search', userId, at: { $gte: since } }),
  ]);
  if (all >= env.TAVILY_MAX_SEARCHES) return 'Date ideas are resting for now (the search budget is used up)';
  if (mine >= env.TAVILY_SEARCHES_PER_USER_DAY) return 'You have asked for a lot of date ideas today. Try again tomorrow';
  return null;
}

/** → { ideas: [{ title, why, link }], icebreakers, cached, nearby? }. `search` is injectable for tests. */
export const dateIdeasFor = (match, viewerId, opts) => asActor({ role: 'dateIdeas', userId: viewerId, otherId: otherUserId(match, viewerId) }, () => ideas(match, viewerId, opts));

async function ideas(match, viewerId, { search = tavilySearch } = {}) {
  const { city, interests, query } = await dateQuery(match, viewerId);
  const icebreakers = (await myDecision(match._id, viewerId))?.icebreakers ?? [];
  const hit = await SearchCache.findOne({ query }).lean();
  if (hit) {
    debug(`date-ideas: cache hit for "${query}"`);
    return { ideas: hit.ideas, icebreakers, cached: true };
  }
  const over = await overBudget(viewerId);
  if (over) {
    const near = await SearchCache.findOne({ query: { $regex: `in ${city.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$` } }).lean();
    if (near) return { ideas: near.ideas, icebreakers, cached: true, nearby: true };
    throw httpError(503, 'DATE_IDEAS_UNAVAILABLE', over);
  }
  let raw;
  try {
    raw = await search(query);
  } finally {
    await Usage.create({ purpose: 'tavily-search', tier: 'search', provider: 'tavily', userId: viewerId, matchId: match._id, ok: Boolean(raw) });
  }
  const results = raw.filter((r) => r.url);
  const urls = new Set(results.map((r) => r.url));
  let ideas;
  try {
    const out = await chatJSON({ tier: 'fast', schema: ideasSchema, purpose: 'date-ideas', userId: viewerId, matchId: match._id, messages: dateIdeasPrompt.build({ city, interests, results }) });
    ideas = out.ideas.filter((i) => urls.has(i.link)).slice(0, 3); // only links that came from the search
  } catch (err) {
    // The model timed out or AI is paused: the search (a spent credit) still gives good ideas as they are.
    console.warn(`date-ideas: writing ideas failed (${err.message}); using the search results as they are`);
    ideas = results.slice(0, 3).map((r) => ({ title: String(r.title ?? r.url).slice(0, 120), why: String(r.content ?? '').slice(0, 200), link: r.url }));
  }
  if (ideas.length) await SearchCache.updateOne({ query }, { $setOnInsert: { query, ideas } }, { upsert: true });
  debug(`date-ideas: searched "${query}" → ${ideas.length} ideas`);
  return { ideas, icebreakers, cached: false };
}
