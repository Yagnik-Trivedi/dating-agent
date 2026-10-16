// Everything the reply prompt sees for one agent turn. Private facts (traits included) are never listed as sayable;
// traits only shape tone instructions.
import { KgFact } from '../../models/KgFact.js';
import { Message } from '../../models/Message.js';
import { Profile } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { otherUserId } from '../matches.js';
import { nameOf } from '../matches.js';

// "are you a bot?", "am I talking to an AI?", "is this a real person?" → the honest-answer rule applies (consent covers AI handling).
export const AI_QUESTION = /\b(are|r)\s+(you|u)\s+(an?\s+)?(bot|ai|robot|real|human|chatgpt|gpt)\b|talking\s+to\s+(an?\s+)?(bot|ai|robot|machine|chatgpt|real\s+person|human)\b|\b(is\s+this|this\s+is)\s+(an?\s+)?(bot|ai|chatgpt|real\s+person|human)\b|\b(bot|chatgpt|automated)\b[^.!]*\?/i;

const firstNameOf = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'them';
// How much a like matters, so "casual" never turns into "it's my whole personality".
const intensity = (f) => (['likes', 'dislikes'].includes(f.predicate) ? ` [level: ${f.weight >= 0.8 ? 'loves' : f.weight >= 0.5 ? 'likes' : 'casual'}]` : '');
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Metrics + description + traits → the "how they text" card. */
export function styleCard(styleProfile, traits = {}) {
  const m = styleProfile?.metrics ?? {};
  const rules = [];
  if (m.medianWords) rules.push(`usually ${Math.max(1, Math.round(m.medianWords * 0.6))}-${Math.max(3, Math.round(m.medianWords * 1.4))} words per message`);
  if (m.lowercaseStartRatio >= 0.6) rules.push('starts messages in lowercase');
  if (m.laughRate >= 0.25) rules.push('says "haha"/"lol" often');
  if (m.emojiPerMessage >= 0.5) rules.push(`uses emoji often (about ${m.emojiPerMessage} per message)`);
  else if (m.emojiPerMessage !== undefined && m.emojiPerMessage < 0.15) rules.push('rarely uses emoji');
  if (m.exclamationRate >= 0.4) rules.push('uses exclamation marks');
  else if (m.exclamationRate !== undefined && m.exclamationRate < 0.15) rules.push('few exclamation marks');
  if (m.hinglishRatio >= 0.05) rules.push('mixes in some Hinglish words');
  // Traits (private): tone only, never content.
  if (traits.extraversion < 0.4) rules.push('a bit reserved: calm, fewer exclamation marks');
  if (traits.extraversion > 0.7) rules.push('outgoing and playful');
  if (traits.agreeableness > 0.7) rules.push('warm and encouraging');
  if (traits.openness > 0.7) rules.push('curious, enjoys ideas and tangents');
  return [
    styleProfile?.description,
    rules.length && `Rules: ${rules.join('; ')}.`,
    styleProfile?.doList?.length && `Do: ${styleProfile.doList.join('; ')}`,
    styleProfile?.dontList?.length && `Don't: ${styleProfile.dontList.join('; ')}`,
  ].filter(Boolean).join('\n') || 'Casual, warm, short messages.';
}

/**
 * → { firstName, matchName, styleCard, sayable: ["[F1] likes: trekking"], factIds: { F1: ObjectId }, observed, agenda,
 *     focus: { id, topic } | null, transcript, recentTexts, theirLastText, hinglishRatio, lastMessage, theirLastWords, medianWords, opener }
 */
export async function buildContext(match, userId) {
  const otherId = otherUserId(match, userId);
  const [user, mine, self, observed, recent] = await Promise.all([
    User.findById(userId, { name: 1, styleProfile: 1 }).lean(),
    Profile.findOne({ userId }, { name: 1 }).lean(),
    KgFact.find({ subjectId: userId, observerId: null }).sort({ weight: -1, confidence: -1 }).lean(),
    KgFact.find({ matchId: match._id, observerId: userId, subjectId: otherId, confidence: { $gte: 0.5 } }).sort({ confidence: -1 }).limit(15).lean(),
    Message.find({ matchId: match._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const firstName = firstNameOf(mine?.name ?? user?.name);
  const matchName = nameOf(match, otherId);
  const traits = Object.fromEntries(self.filter((f) => f.predicate === 'trait').map((f) => [f.object, f.value]));

  // Sayable: not private, not a dealbreaker (never mentioned), not a trait; if_asked ones are marked.
  const sayableFacts = self.filter((f) => f.disclosure !== 'private' && !['dealbreaker', 'trait', 'style'].includes(f.predicate)).slice(0, 40);
  // Facts this side already used in this chat: marked, so the agent moves on instead of repeating itself.
  const used = new Set(recent.filter((m) => String(m.senderId) === String(userId)).flatMap((m) => (m.meta?.usedFactIds ?? []).map(String)));
  const factIds = {};
  const sayable = sayableFacts.map((f, i) => {
    const id = `F${i + 1}`;
    factIds[id] = f._id;
    const quote = f.evidence?.[0]?.quote;
    const words = quote && quote !== f.object ? ` (in their words: "${short(quote, 160)}")` : '';
    const ifAsked = f.disclosure === 'if_asked' ? ' [only if they ask directly]' : '';
    const shared = used.has(String(f._id)) ? ' [already shared]' : '';
    return `[${id}] ${f.predicate}: ${f.object}${intensity(f)}${words}${ifAsked}${shared}`;
  });

  const brief = match.brief?.[String(userId)];
  const open = (brief?.agenda ?? []).filter((a) => a.status !== 'answered').sort((a, b) => b.priority - a.priority);
  const agenda = open.slice(0, 3).map((a) => `[${a.id}] ${a.topic}`);

  const chronological = recent.reverse();
  // Steering: after the warm-up (4 messages), every other turn names ONE topic to bring up. A soft "steer gently"
  // rule alone was ignored in simulations. The turn after a steer is left free so they can answer.
  const myLast = [...chronological].reverse().find((m) => String(m.senderId) === String(userId));
  const focus = chronological.length >= 4 && !myLast?.meta?.targets && open[0] ? { id: open[0].id, topic: open[0].topic } : null;
  const recentTexts = chronological.slice(-6).map((m) => m.text);
  const transcript = chronological.map((m) => `${String(m.senderId) === String(userId) ? 'You' : matchName}: ${m.text}`);
  const theirLast = [...chronological].reverse().find((m) => String(m.senderId) !== String(userId));
  const askedIfAI = Boolean(theirLast && theirLast === chronological.at(-1) && AI_QUESTION.test(theirLast.text));

  return {
    firstName,
    matchName,
    styleCard: styleCard(user?.styleProfile, traits),
    sayable,
    factIds,
    observed: observed.map((f) => `${f.predicate}: ${f.object} (confidence ${f.confidence.toFixed(1)})`),
    agenda,
    focus: askedIfAI ? null : focus,
    askedIfAI,
    transcript,
    recentTexts,
    lastMessage: chronological.at(-1) ?? null,
    theirLastWords: theirLast ? theirLast.text.split(/\s+/).length : 0,
    theirLastText: theirLast?.text ?? '',
    medianWords: user?.styleProfile?.metrics?.medianWords ?? 10,
    hinglishRatio: user?.styleProfile?.metrics?.hinglishRatio ?? 0,
    lowercase: (user?.styleProfile?.metrics?.lowercaseStartRatio ?? 0) >= 0.6,
    opener: brief?.openers?.[0]?.text ?? null,
  };
}
