// Owner's test run (2026-10-27): one user's agent chats with a list of people one after another, each chat running all
// its sessions back to back (CHAT_DEPTHS.chain). The chain lives on the match (`chain: { owner, next, depth }`); when a
// chained match settles, the server starts the owner's next match, so it runs with nobody's laptop on.
import { Match } from '../../models/Match.js';
import { enqueue } from '../jobs/queue.js';
import { createMatch } from '../matches.js';

/** Statuses after which a chained match is done and the next one may start. */
export const CHAIN_DONE = ['compatible', 'maybe', 'incompatible', 'handed_off', 'closed', 'flagged_fake'];

/** setStatus hook: a chained match that just finished queues the next one. */
export async function chainAfter(matchId, status) {
  if (!CHAIN_DONE.includes(status)) return;
  const m = await Match.findById(matchId, { chain: 1 }).lean();
  if (!m?.chain?.next?.length) return;
  await enqueue('chainNext', { matchId: String(matchId) }, { dedupeKey: `chain:${matchId}`, runAt: new Date(Date.now() + 20_000) });
}

/** Job: start the owner's next match in the chain (skipping anyone who can't be matched right now). */
export async function runChainNext({ matchId }) {
  const m = await Match.findById(matchId, { chain: 1 }).lean();
  let next = [...(m?.chain?.next ?? [])];
  while (next.length) {
    const [id, ...rest] = next;
    const created = await createMatch(m.chain.owner, id, { admin: true, chatDepth: m.chain.depth, chain: { owner: m.chain.owner, next: rest, depth: m.chain.depth } });
    if (created) {
      // An older match between the two (not cleared first) is reused: hand it the rest of the chain, and move on if it's already done.
      if (!created.chain) {
        await Match.updateOne({ _id: created._id }, { $set: { chain: { owner: m.chain.owner, next: rest, depth: m.chain.depth } } });
        if (CHAIN_DONE.includes(created.status)) await chainAfter(created._id, created.status);
      }
      console.log(`chain: started ${created._id} (${rest.length} left)`);
      return;
    }
    console.warn(`chain: ${id} can't be matched now, skipping`);
    next = rest;
  }
}
