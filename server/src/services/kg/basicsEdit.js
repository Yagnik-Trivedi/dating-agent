// Plan 32 KP2 (A6.10): a profile basic (smoking, kids…) has ONE source of truth, my section-B answer. Editing it on my
// profile updates the answer, then my self fact, then the gate and the public tag, in that order, in one transaction
// (no model calls, so it runs in the request instead of a job). "Show on my profile" (tagsHidden) only changes
// visibility, never the answer. v3 adds a SUPERSEDES edge from the new fact to the old one; v2 updates the fact in place.
import { KgFact } from '../../models/KgFact.js';
import { KgTombstone } from '../../models/KgTombstone.js';
import { Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { withTransaction } from '../db.js';
import { BASICS, buildGate, hiddenBasics } from '../match/gate.js';
import { lookupConcept } from './canonicalize.js';
import { factKey } from './factKey.js';
import { questionnaireFacts } from './questionnaireFacts.js';
import { QUESTIONS } from './questions.js';

const B = QUESTIONS.sections.find((s) => s.id === 'B');
const itemOf = (attr) => B.items.find((i) => i.id === attr);

/** Is this a section-B option value for a basic? (The profile also allows free text, which stays a display-only tag.) */
export const isBasicAnswer = (attr, value) => Boolean(BASICS[attr] && itemOf(attr)?.options.some((o) => o.value === value));

/** My basics for the profile editor: the question, its options, my answer and whether it shows on my profile. */
export async function myBasics(userId) {
  const [user, profile] = await Promise.all([User.findById(userId, { 'onboarding.answers.B': 1 }).lean(), Profile.findOne({ userId }, { tagsHidden: 1 }).lean()]);
  const answers = user?.onboarding?.answers?.B ?? {};
  const hidden = hiddenBasics(profile);
  return Object.keys(BASICS).map((attr) => ({
    attr, text: itemOf(attr).text, options: itemOf(attr).options, answer: answers[attr]?.answer ?? null, shown: !hidden.includes(attr),
  }));
}

/**
 * edits: { [attr]: optionValue } (validated with isBasicAnswer by the caller). A basic I never answered gets importance
 * 'medium' (the onboarding default weight). → the attributes changed
 */
export async function editBasics(userId, edits) {
  const user = await User.findById(userId, { 'onboarding.answers.B': 1 }).lean();
  const before = user?.onboarding?.answers?.B ?? {};
  const changed = Object.entries(edits).filter(([attr, value]) => isBasicAnswer(attr, value) && before[attr]?.answer !== value);
  if (!changed.length) return [];
  const answers = Object.fromEntries(changed.map(([attr, value]) => [attr, { importance: 'medium', ...before[attr], answer: value }]));
  // The new self facts, exactly as an onboarding build would make them; concepts from the dictionary (no model call).
  const facts = questionnaireFacts({ B: answers }).filter((f) => f.attribute in answers);
  for (const f of facts) f.conceptId = (await lookupConcept(f.conceptText))?.id ?? null;
  const tombstones = new Set(await KgTombstone.distinct('key', { subjectId: userId }));
  const now = new Date();

  await withTransaction(async (session) => {
    // 1. The answer.
    await User.updateOne({ _id: userId }, { $set: Object.fromEntries(Object.entries(answers).map(([attr, a]) => [`onboarding.answers.B.${attr}`, a])) }, { session });
    // 2. My self fact for it: updated in place (keeps its id, user edits and disclosure), or created unless I deleted it.
    for (const { conceptText, conceptType, evidence, ...f } of facts) {
      const set = { object: f.object, value: f.value, accepts: f.accepts, importance: f.importance, weight: f.importance, isDealbreaker: f.isDealbreaker, conceptId: f.conceptId, lastConfirmed: now };
      const proof = { quote: itemOf(f.attribute).options.find((o) => o.value === f.value).label, sourceRef: { kind: 'answer', id: `B.${f.attribute}` }, at: now };
      const res = await KgFact.updateOne({ subjectId: userId, observerId: null, attribute: f.attribute, source: 'questionnaire_choice' }, { $set: set, $push: { evidence: proof } }, { session });
      if (!res.matchedCount && !tombstones.has(factKey(f))) {
        await KgFact.create([{ ...f, ...set, subjectId: userId, observerId: null, evidence: [proof], firstSeen: now }], { session });
      }
    }
    // 3. The gate and the public tag follow the answer again (a tag set by hand before KP2 stops overriding it).
    await Profile.updateOne({ userId }, { $pull: { tagsEdited: { $in: Object.keys(answers) } } }, { session });
    await buildGate(userId, { session });
    await User.updateOne({ _id: userId }, { $inc: { graphVersion: 1 } }, { session });
  });
  return Object.keys(answers);
}
