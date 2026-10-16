import { nameOf } from '../matches.js';
import { buildBrief } from './buildBrief.js';

const EMPTY = { summary: '', agenda: [], openers: [], watchouts: [] };

/** Step 2: both agents build their brief in parallel. → { [userId]: brief }. A failed side gets an empty brief. */
export async function buildBriefs(match) {
  const [a, b] = match.users.map(String);
  const one = (viewerId, subjectId) => buildBrief({ viewerId, subjectId, matchId: match._id, trust: match.trust?.[viewerId], viewerName: nameOf(match, viewerId) })
    .catch((err) => {
      console.error(`brief ${match._id} for ${viewerId} failed: ${err.message}`);
      return { ...EMPTY, unavailable: true, builtAt: new Date() };
    });
  const [ba, bb] = await Promise.all([one(a, b), one(b, a)]);
  return { [a]: ba, [b]: bb };
}
