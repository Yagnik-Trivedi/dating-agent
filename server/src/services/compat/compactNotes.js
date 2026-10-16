// `compactNotes` job (plan 09 §3): when a match closes, each side's raw notes + chat moments are summarised into that
// side's MatchDecision.notesSummary (mid, reasoning off, ≤ 120 words), then the notes, moments and agent messages get
// archiveAt = now + NOTES_RETENTION_DAYS (TTL indexes remove them later). A handed-off (or reopened) match keeps them.
import { z } from 'zod';
import { ChatEvent } from '../../models/ChatEvent.js';
import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { MatchDecision } from '../../models/MatchDecision.js';
import { Message } from '../../models/Message.js';
import { asActor } from '../actor.js';
import { KG } from '../kg/config.js';
import { chatJSON } from '../llm/client.js';
import { nameOf, otherUserId } from '../matches.js';
import * as compactPrompt from '../prompts/compactNotes.js';

export const COMPACTABLE = ['closed', 'flagged_fake'];
const words = (s) => s.split(/\s+/).filter(Boolean);

async function summarise(match, userId) {
  const decision = await MatchDecision.findOne({ matchId: match._id, userId }).sort({ createdAt: -1 });
  if (!decision || decision.notesSummary != null) return false;
  const [notes, events] = await Promise.all([
    KgFact.find({ observerId: userId, matchId: match._id }, { predicate: 1, object: 1, evidence: 1 }).lean(),
    ChatEvent.find({ observerId: userId, matchId: match._id }, { type: 1, quote: 1, label: 1 }).lean(),
  ]);
  let summary = '';
  if (notes.length || events.length) {
    const out = await chatJSON({
      tier: 'mid', reasoning: false, purpose: 'compact-notes', userId, matchId: match._id, schema: z.object({ summary: z.string().trim().max(1500) }),
      messages: compactPrompt.build({
        matchName: nameOf(match, otherUserId(match, userId)),
        decision: decision.decision,
        notes: notes.map((n) => `${n.predicate}: ${n.object}${n.evidence?.[0]?.quote ? ` ("${n.evidence[0].quote}")` : ''}`),
        events: events.map((e) => `${e.type}${e.label ? ` (${e.label})` : ''}${e.quote ? `: "${e.quote}"` : ''}`),
      }),
    });
    summary = words(out.summary).slice(0, 120).join(' ');
  }
  decision.notesSummary = summary;
  await decision.save();
  return true;
}

export async function compactNotes({ matchId }) {
  const match = await Match.findById(matchId).lean();
  if (!match || !COMPACTABLE.includes(match.status)) return { skipped: match?.status ?? 'missing' };
  let summarised = 0;
  for (const u of match.users.map(String)) {
    summarised += await asActor({ role: 'judge', userId: u, otherId: otherUserId(match, u) }, () => summarise(match, u)) ? 1 : 0;
  }
  // Re-check: the match may have been reopened ("Talk anyway") while we were summarising.
  const now = await Match.findById(matchId, { status: 1 }).lean();
  if (!COMPACTABLE.includes(now?.status)) return { summarised, archived: false };
  const archiveAt = new Date(Date.now() + KG.NOTES_RETENTION_DAYS * 86_400_000);
  const [notes, events, messages] = await Promise.all([
    KgFact.updateMany({ matchId, observerId: { $ne: null }, archiveAt: null }, { $set: { archiveAt } }),
    ChatEvent.updateMany({ matchId, archiveAt: null }, { $set: { archiveAt } }),
    Message.updateMany({ matchId, authoredBy: 'agent', archiveAt: null }, { $set: { archiveAt } }),
  ]);
  return { summarised, notes: notes.modifiedCount, events: events.modifiedCount, messages: messages.modifiedCount };
}
