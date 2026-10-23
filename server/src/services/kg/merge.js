// Pure merge logic for the build (plan 05 §5 steps 5 and 7): dedupe new facts by factKey, then plan the re-submit
// against the user's existing graph. No DB access, so it's unit-tested directly.
import { factKey } from './factKey.js';

// Never touched by a rebuild: what the user told us later, notes, reflections and their own chats.
export const PROTECTED_SOURCES = new Set(['user_answer', 'agent_observed', 'reflection', 'own_chat']);
const REBUILT_SOURCES = new Set(['questionnaire_choice', 'questionnaire_story']);
export const polarKey = (f) => `${factKey(f)}|${f.polarity ?? 1}`;

const unionEvidence = (a = [], b = []) => {
  const seen = new Set(a.map((e) => `${e.quote}|${e.sourceRef?.id}`));
  return [...a, ...b.filter((e) => !seen.has(`${e.quote}|${e.sourceRef?.id}`))];
};

/**
 * Same key + same polarity → one fact (strength max, evidence union, earliest firstSeen, confidence/source from the
 * best member). Same key, opposite polarity → both kept, returned as a contradiction pair.
 * → { facts, contradictions: [[keyA, keyB]] } where keys are polarKeys; each fact carries `_key` (its polarKey).
 */
export function mergeFacts(facts) {
  const byKey = new Map();
  for (const f of facts) {
    const k = polarKey(f);
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, { ...f, _key: k, _members: [f] }); continue; }
    const best = (f.confidence ?? 0) > (cur.confidence ?? 0) ? f : cur;
    byKey.set(k, {
      ...cur,
      ...(best === f && { confidence: f.confidence, source: f.source, object: f.object }),
      strength: Math.max(cur.strength ?? 0, f.strength ?? 0) || cur.strength,
      importance: Math.max(cur.importance ?? 0, f.importance ?? 0) || cur.importance,
      isDealbreaker: Boolean(cur.isDealbreaker || f.isDealbreaker),
      evidence: unionEvidence(cur.evidence, f.evidence),
      firstSeen: [cur.firstSeen, f.firstSeen].filter(Boolean).sort((a, b) => a - b)[0],
      _members: [...cur._members, f],
    });
  }
  const merged = [...byKey.values()];
  const contradictions = [];
  for (const f of merged) {
    if ((f.polarity ?? 1) !== 1) continue;
    const opposite = byKey.get(`${factKey(f)}|-1`);
    if (opposite) contradictions.push([f._key, opposite._key]);
  }
  return { facts: merged, contradictions };
}

/**
 * Re-submit merge (F27) of freshly merged facts against the existing self graph.
 * → { inserts: [fact], updates: [{ id, set, pushEvidence }], keepEdited: [{ id, pushEvidence }], deletes: [id], keyToId }
 */
export function planResubmit({ merged, existing, tombstones, rebuilt = REBUILT_SOURCES }) {
  const dead = new Set(tombstones);
  const byKey = new Map(existing.filter((e) => !PROTECTED_SOURCES.has(e.source)).map((e) => [polarKey(e), e]));
  const out = { inserts: [], updates: [], keepEdited: [], deletes: [], keyToId: new Map() };
  const wanted = new Set();
  for (const f of merged) {
    if (dead.has(factKey(f))) continue; // the user deleted it: it never comes back
    wanted.add(f._key);
    const old = byKey.get(f._key);
    if (!old) { out.inserts.push(f); continue; }
    out.keyToId.set(f._key, old._id);
    const newEvidence = (f.evidence ?? []).filter((e) => !(old.evidence ?? []).some((o) => o.quote === e.quote && o.sourceRef?.id === e.sourceRef?.id));
    if (old.userEdited) { out.keepEdited.push({ id: old._id, pushEvidence: newEvidence }); continue; }
    const { _key, _members, evidence, ...set } = f;
    out.updates.push({ id: old._id, set: { ...set, disclosure: old.disclosure ?? set.disclosure }, pushEvidence: newEvidence });
  }
  for (const e of existing) {
    if (rebuilt.has(e.source) && !e.userEdited && !wanted.has(polarKey(e))) out.deletes.push(e._id);
  }
  return out;
}
