// Learning from my own side (plan 08 §3, plan 15 stage 7): corrections ("That's not me" on a style node, "I wouldn't
// say that" on my agent's message) and my own messages after handoff. Only MY words are stored: `incoming` stays null,
// because exemplars are pasted into my agent's prompts in other chats and must never carry another user's message
// (the transcript is the only cross-user path, and their words must not outlive their account or the match).
import { z } from 'zod';
import { KgFact } from '../../models/KgFact.js';
import { User } from '../../models/User.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { VoiceSample } from '../../models/VoiceSample.js';
import { chatJSON } from '../llm/client.js';
import * as voiceCorrection from '../prompts/voiceCorrection.js';
import { tagLanguageHeuristic } from './language.js';
import { noteSelfFacts, noteVoiceSample } from './learning.js';

const ruleSchema = z.object({
  rule: z.string().trim().min(1).max(160),
  kind: z.enum(['style', 'never_say', 'fact']).catch('style'),
  phrase: z.string().trim().toLowerCase().max(40).optional().catch(undefined),
});

/** One LLM call: the user's correction → { rule, kind, phrase? }. */
export const correctionRule = ({ userId, ...input }) => chatJSON({ tier: 'mid', reasoning: false, purpose: 'voice-correction', userId,
  schema: ruleSchema, messages: voiceCorrection.build(input) });

/**
 * Apply a style / never_say rule to the profile doc (not saved). neverSay holds literal phrases: the style check looks
 * for them in the reply text, so a never_say rule without a phrase stays a correction only.
 */
export function addRule(profile, { rule, kind, phrase }, from) {
  profile.corrections.push({ rule, kind: kind === 'never_say' ? 'never_say' : 'style', from, at: new Date() });
  if (kind === 'never_say' && phrase && !profile.neverSay.includes(phrase)) profile.neverSay.push(phrase);
}

/** "I wouldn't say that" on my own agent's message, optionally with how I'd say it. → the rule */
export async function wouldntSay({ message, userId, fix }) {
  if (fix) await VoiceSample.create({ userId, text: fix, source: 'edited_draft', mood: 'casual', lang: tagLanguageHeuristic(fix) });
  const out = await correctionRule({ userId, original: message.text, fix, correction: fix ? null : "I wouldn't say that" });
  if (out.kind === 'fact') {
    // The agent got a fact about me wrong: the corrected fact is mine, stated by me (like an inbox answer).
    await KgFact.create({ subjectId: userId, observerId: null, predicate: 'background', object: out.rule, source: 'user_answer', confidence: 0.9,
      strength: 0.5, weight: 0.5, disclosure: 'if_asked', userEdited: true,
      evidence: [{ quote: fix ?? out.rule, sourceRef: { kind: 'message', id: String(message._id) }, at: new Date() }] });
  } else {
    const profile = await VoiceProfile.findOne({ userId });
    if (profile) { addRule(profile, out, 'wouldnt_say'); await profile.save(); }
  }
  await User.updateOne({ _id: userId }, { $inc: { graphVersion: 1 } });
  await Promise.all([fix && noteVoiceSample(userId), out.kind === 'fact' && noteSelfFacts(userId)]);
  return out;
}

/** After handoff, with settings.learnFromChats on: my own typed message → VoiceSample(own_chat). */
export async function learnOwnMessage(message, match) {
  if (message.authoredBy !== 'human' || match.status !== 'handed_off') return false;
  const user = await User.findById(message.senderId, { settings: 1 }).lean();
  if (user?.settings?.learnFromChats === false) return false;
  await VoiceSample.create({ userId: message.senderId, text: message.text, source: 'own_chat', mood: 'casual', lang: tagLanguageHeuristic(message.text) });
  await noteVoiceSample(message.senderId);
  return true;
}
