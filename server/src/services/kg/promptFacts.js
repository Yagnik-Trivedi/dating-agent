// UX P0-4: my profile prompt answers are claimable facts (sourceAnswerId prompt_<n>). Editing the prompts replaces
// them right away; the next full build makes the same facts (questionnaireFacts), so the two never disagree.
import { KgFact } from '../../models/KgFact.js';
import { KgTombstone } from '../../models/KgTombstone.js';
import { User } from '../../models/User.js';
import { embed, embeddingModel } from '../llm/client.js';
import { withTransaction } from '../db.js';
import { factKey } from './factKey.js';
import { questionnaireFacts } from './questionnaireFacts.js';

export async function syncPromptFacts(userId, prompts = []) {
  const tombstones = new Set(await KgTombstone.distinct('key', { subjectId: userId }));
  const facts = questionnaireFacts({}, { prompts }).filter((f) => f.sourceAnswerId && !tombstones.has(factKey(f)));
  // A failed embedding only costs relevance until the next build; the facts are still saved.
  const vectors = facts.length ? await embed(facts.map((f) => f.object), { purpose: 'prompt-embed', userId }).catch((err) => { console.warn('prompt facts: embed failed:', err.message); return []; }) : [];
  const now = new Date();
  await withTransaction(async (session) => {
    await KgFact.deleteMany({ subjectId: userId, observerId: null, sourceAnswerId: /^prompt_/ }, { session });
    if (facts.length) {
      await KgFact.create(facts.map((f, i) => ({ ...f, subjectId: userId, observerId: null, firstSeen: now, lastConfirmed: now, ...(vectors[i] && { embedding: vectors[i], embeddingModel: embeddingModel() }) })), { session, ordered: true });
    }
    await User.updateOne({ _id: userId }, { $inc: { graphVersion: 1 } }, { session });
  });
}
