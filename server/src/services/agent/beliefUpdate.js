// After every message from the other side: learn facts about them (verbatim quotes only), update the agenda,
// note red flags, and push kg:update to the viewer.
import { z } from 'zod';
import { items } from '../../utils/zodItems.js';
import { KgFact } from '../../models/KgFact.js';
import { Match } from '../../models/Match.js';
import { Message } from '../../models/Message.js';
import { Profile } from '../../models/Profile.js';
import { emitToUser } from '../../sockets/io.js';
import { differentAnswer } from '../kg/selfFacts.js';
import { isVerbatim } from '../kg/extractFacts.js';
import { embedFacts } from '../kg/factEmbedding.js';
import { cosine } from '../kg/similarity.js';
import { chatJSON } from '../llm/client.js';
import * as beliefUpdate from '../prompts/beliefUpdate.js';
import { nameOf } from '../matches.js';

const MERGE_THRESHOLD = 0.85;
const MAX_CONFIDENCE = 0.95;
const RANK = { open: 0, partially: 1, answered: 2 };

// One malformed item (e.g. an empty quote) drops that item, not the whole update.
const schema = z.object({
  facts: items(z.object({
    predicate: z.enum(beliefUpdate.PREDICATES),
    object: z.string().trim().min(1).max(80),
    weight: z.coerce.number().min(0).max(1).catch(0.5),
    confidence: z.coerce.number().min(0).max(1).catch(0.5),
    quote: z.string().trim().min(1).max(400),
    agendaId: z.string().nullable().catch(null).default(null),
  })),
  agendaUpdates: items(z.object({ id: z.string(), status: z.enum(['open', 'partially', 'answered']).catch('open'), note: z.string().max(200).catch('') })),
  redFlags: items(z.object({ flag: z.string().trim().min(1).max(160), quote: z.string().trim().min(1).max(400) })),
});

/** Bayesian-ish confidence bump for a restated fact. */
export const bump = (old, c) => Math.min(MAX_CONFIDENCE, 1 - (1 - old) * (1 - c));

/** Agenda statuses only move forward (open → partially → answered); confidence takes the max. */
export function applyAgendaUpdates(agenda, updates, factConfidences = {}) {
  return agenda.map((a) => {
    const u = updates.find((x) => x.id === a.id);
    const status = u && RANK[u.status] > RANK[a.status] ? u.status : a.status;
    return { ...a, status, confidence: Math.max(a.confidence ?? 0, factConfidences[a.id] ?? 0) };
  });
}

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'They';

/** viewer's agent learns from `message` (sent by the other side). → { facts (for the client), touched (with embeddings), agenda, redFlags } */
export async function learnFromMessage(match, viewerId, message) {
  const subjectId = message.senderId;
  const viewer = String(viewerId);
  const [recent, observed] = await Promise.all([
    Message.find({ matchId: match._id, createdAt: { $lte: message.createdAt } }).sort({ createdAt: -1 }).limit(6).lean(),
    KgFact.find({ matchId: match._id, observerId: viewerId, subjectId }).select('+embedding').lean(),
  ]);
  const matchName = nameOf(match, subjectId);
  const theirs = recent.filter((m) => String(m.senderId) === String(subjectId));
  const fresh = await Match.findById(match._id, { brief: 1 }).lean(); // agenda as of now (earlier updates may have landed)
  let agenda = fresh?.brief?.[viewer]?.agenda ?? [];

  // Reasoning off: runs on every message and timed out at 120 s with it on (NVIDIA); quotes are verified in code anyway.
  const out = await chatJSON({
    tier: 'mid', reasoning: false, schema, purpose: 'belief-update', userId: viewerId, matchId: match._id,
    messages: beliefUpdate.build({
      matchName,
      transcript: recent.reverse().map((m) => `${String(m.senderId) === viewer ? 'Me' : matchName}: ${m.text}`),
      observed: observed.sort((a, b) => b.confidence - a.confidence).slice(0, 30).map((f) => `${f.predicate}: ${f.object} (confidence ${f.confidence.toFixed(1)})`),
      agenda: agenda.filter((a) => a.status !== 'answered').map((a) => `[${a.id}] ${a.topic}`),
    }),
  });

  // Their exact words only, from one of their messages.
  const learned = out.facts
    .map((f) => ({ ...f, source: theirs.find((m) => isVerbatim(f.quote, m.text)) }))
    .filter((f) => f.source)
    .slice(0, 6);
  const vectors = await embedFacts(learned, { userId: viewerId });
  const changed = [];
  const touched = []; // same facts with embeddings, for the stop rule's dealbreaker check
  const agendaConfidence = {};
  const agendaIds = new Set(agenda.map((a) => a.id));

  for (const [i, f] of learned.entries()) {
    const evidence = { messageId: f.source._id, quote: f.quote };
    const same = observed
      .filter((o) => o.predicate === f.predicate && !differentAnswer(o.object, f.object))
      .map((o) => ({ o, score: cosine(o.embedding, vectors[i].embedding) }))
      .filter((x) => x.score >= MERGE_THRESHOLD)
      .sort((a, b) => b.score - a.score)[0]?.o;
    let doc;
    if (same) {
      same.confidence = bump(same.confidence, f.confidence);
      doc = await KgFact.findByIdAndUpdate(same._id, { $set: { confidence: same.confidence }, $push: { evidence: evidence } }, { new: true }).lean();
      touched.push(same);
    } else {
      doc = (await KgFact.create({
        subjectId, observerId: viewerId, matchId: match._id, predicate: f.predicate, object: f.object, weight: f.weight,
        confidence: Math.min(f.confidence, 0.9), source: 'conversation', disclosure: 'public', evidence: [evidence], ...vectors[i],
      })).toObject();
      observed.push({ ...doc });
      touched.push(observed.at(-1));
    }
    delete doc.embedding;
    changed.push(doc);
    if (agendaIds.has(f.agendaId)) agendaConfidence[f.agendaId] = Math.max(agendaConfidence[f.agendaId] ?? 0, doc.confidence);
  }

  const redFlags = out.redFlags.filter((r) => theirs.some((m) => isVerbatim(r.quote, m.text)));
  agenda = applyAgendaUpdates(agenda, out.agendaUpdates, agendaConfidence);
  const $set = { [`brief.${viewer}.agenda`]: agenda };
  const update = { $set };
  if (redFlags.length) update.$push = { [`agentState.redFlags.${viewer}`]: { $each: redFlags, $slice: -10 } };
  if (fresh?.brief?.[viewer]) await Match.updateOne({ _id: match._id }, update);
  else if (redFlags.length) await Match.updateOne({ _id: match._id }, { $push: update.$push });

  emitToUser(viewerId, 'kg:update', { matchId: String(match._id), facts: changed, agenda });
  return { facts: changed, touched, agenda, redFlags };
}
