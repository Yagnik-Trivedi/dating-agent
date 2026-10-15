// Onboarding answers → the user's personal knowledge graph (KgFact, observerId null) + style profile.
// Runs in the background after POST /api/onboarding/submit; status goes processing → done | failed.
import { KgFact } from '../../models/KgFact.js';
import { User } from '../../models/User.js';
import { emitToUser } from '../../sockets/io.js';
import { mapLimit } from '../../utils/mapLimit.js';
import { extractFacts } from './extractFacts.js';
import { embedFacts } from './factEmbedding.js';
import { QUESTIONS } from './questions.js';
import { questionnaireFacts } from './questionnaireFacts.js';
import { buildStyleProfile } from './styleProfile.js';

const LLM_CONCURRENCY = 2; // gentle on the provider's rate limit

/** → { facts, dropped } for the user, saved; throws on failure (caller marks the user failed). */
export async function buildUserGraph(userId) {
  const user = await User.findById(userId);
  const answers = user?.onboarding?.answers ?? {};
  const stories = QUESTIONS.sections.find((s) => s.id === 'C').items.filter((q) => String(answers.C?.[q.id] ?? '').trim());

  // Deterministic facts, LLM story facts and the style profile, in parallel where it's cheap.
  const [extracted, styleProfile] = await Promise.all([
    mapLimit(stories, LLM_CONCURRENCY, (q) => extractFacts({
      question: q.text, answer: answers.C[q.id], userId, source: 'questionnaire', confidence: 0.85, purpose: 'onboarding-story-facts',
    })),
    buildStyleProfile({ answersE: answers.E, userId }),
  ]);
  const facts = [...questionnaireFacts(answers), ...extracted.flatMap((e) => e.facts)];
  const dropped = extracted.reduce((s, e) => s + e.dropped, 0);

  const embeddings = await embedFacts(facts, { purpose: 'onboarding-embed', userId });
  const docs = facts.map((f, i) => ({ ...f, ...embeddings[i], subjectId: userId, observerId: null, matchId: null }));

  // Idempotent: replace previous questionnaire-derived facts; never touch the user's inbox answers.
  await KgFact.deleteMany({ subjectId: userId, observerId: null, source: { $in: ['questionnaire', 'inferred'] } });
  await KgFact.insertMany(docs);
  await User.updateOne({ _id: userId }, {
    $set: { styleProfile, 'onboarding.status': 'done', 'onboarding.completedAt': new Date() },
  });
  return { facts: docs.length, dropped };
}

/** Fire-and-forget wrapper used by the submit route. */
export function startUserGraphBuild(userId) {
  buildUserGraph(userId)
    .then(({ facts, dropped }) => {
      console.log(`onboarding ${userId}: ${facts} facts (${dropped} unquoted dropped)`);
      emitToUser(userId, 'onboarding:done', { status: 'done' });
    })
    .catch(async (err) => {
      console.error(`onboarding ${userId} failed: ${err.message}`);
      await User.updateOne({ _id: userId }, { $set: { 'onboarding.status': 'failed' } }).catch(() => {});
      emitToUser(userId, 'onboarding:done', { status: 'failed' });
    });
}

/** A restart kills in-flight builds: mark them failed so the UI offers "submit again" instead of spinning. */
export const failStuckOnboarding = () => User.updateMany({ 'onboarding.status': 'processing' }, { $set: { 'onboarding.status': 'failed' } });
