// Post-draft checks (plan 08 §1.3). Style, grounding and leak run in code; only the stance check (when the plan says
// I must disagree) calls an LLM. Each returns problems + the sentences to drop if a regeneration doesn't fix them.
import { z } from 'zod';
import { KG } from '../kg/config.js';
import { hinglishCount, tokensOf } from '../kg/language.js';
import { cosine } from '../kg/similarity.js';
import { chatJSON } from '../llm/client.js';
import * as stancePrompt from '../prompts/stanceCheck.js';
import { scanMessage } from '../trust/rules.js';
import { echoOf, norm, sentencesOf, words } from './text.js';

const EMOJI = /\p{Extended_Pictographic}/u;
const ascii = (t) => String(t).replace(/[’‘`´]/g, "'"); // models write "haven’t"; every pattern below uses '
const FIRST_PERSON = /\b(i|i'm|im|i've|ive|i'd|i'll|my|me|mine|myself|mera|meri|mujhe)\b/i;
// Reactions to what THEY said are not claims about me ("i love that!", "i'm so glad").
const REACTION = /^\W*(haha\w*|lol|oh|ah+|aw+|wow|omg|ooh|yes|yeah|nice|true|fair|okay|ok)?[\s,!.]*(i (really |totally |kinda )?(love|like|adore|agree|get|see|feel|know|hear|bet|mean|hope|think|guess|believe) (that|this|it|you|how|what|so|the way)\b|i('m| am) (so |really )?(glad|happy|sorry|curious|jealous|intrigued|impressed)\b|i (can't|cannot) wait\b|i (totally |completely )?(agree|understand)\b)/i;
const INTERROGATIVE = /^\W*(what|how|do|did|does|have|has|are|is|would|will|where|when|which|who|why|could|can|should)\b/i;
// Honest uncertainty ("never tried it", "not sure") is what the plan asks for when there's no fact: always allowed.
const HONEST = /\b(never (tried|done|been|had|seen|watched|played)|haven'?t (tried|done|been|had|seen|watched|played|really)|have not|not sure|don'?t know|no idea|not really (into|a)|not much of a|can'?t say|don'?t (really )?follow|not (really |much )?(a fan|into)|still figuring)\b/i;
// "you're into X", "your trekking pic", "you love …": statements about the other person.
const YOU_CLAIM = /\b(you('re| are| were)|you (love|like|enjoy|have|had|seem|said|mentioned|told|work|live|do|go|play|read|watch|cook|travel)|your)\b/i;
// Arranging a real meeting (times, days, "let's meet"): the agent never does this (product rule), however the model drifts.
const MEETING = /\b(what time|which time|meet (up|you|there)|let'?s (meet|go|do it|grab)|see you (at|on|there)|pick you up|tomorrow at|(this|next) (saturday|sunday|weekend|friday)|at \d{1,2}(:\d{2})? ?(am|pm)|around \d{1,2} ?(am|pm))\b/i;
const STOP = new Set(['about', 'their', 'there', 'these', 'those', 'which', 'would', 'could', 'should', 'really', 'sounds', 'something', 'things', 'thing', 'always', 'never', 'other', 'being', 'still', 'maybe']);

const clausesOf = (s) => s.split(/\s*[—–;]\s*|,\s+(?=(?:and |but |so |though )?(?:i|i'm|i've|my|me)\b)/i).map((c) => c?.trim()).filter((c) => c && /[\p{L}]/u.test(c));
const jaccard = (a, b) => { const A = new Set(norm(a)), B = new Set(norm(b)); const inter = [...A].filter((x) => B.has(x)).length; return inter / (new Set([...A, ...B]).size || 1); };
const covers = (claimText, sentence) => { const c = norm(claimText).join(' '), s = norm(sentence).join(' '); return (c && (s.includes(c) || c.includes(s))) || jaccard(claimText, sentence) >= 0.5; };
const contentWords = (s) => tokensOf(s).filter((w) => w.length >= 5 && !STOP.has(w));

/**
 * Style vs the act plan and my voice → hard problems that justify the one regeneration. Cosmetic drift (a bit long,
 * a question the plan didn't ask for) is reported by styleNotes() and stored, not regenerated: in the first live run
 * regenerating for it doubled the cost of most turns. Lowercase starts are fixed by the caller.
 */
export function styleCheck(text, plan, voice = {}, recentTexts = []) {
  text = ascii(text);
  const problems = [];
  const n = words(text).length;
  const target = plan.targetWords * (plan.burst ?? 1);
  if (n > target * 2.5 + 3) problems.push(`too long (${n} words; aim for about ${target})`);
  if ((text.match(/\?/g) ?? []).length > 1) problems.push('more than one question');
  const neverEmoji = (voice.neverSay ?? []).includes('emoji') || voice.emojiPerMessage === 0;
  if (neverEmoji && EMOJI.test(text)) problems.push('uses an emoji, which this person never does');
  for (const phrase of (voice.neverSay ?? []).filter((p) => p !== 'emoji' && p.length < 40)) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) problems.push(`says "${phrase}", which this person never says`);
  }
  const usesHindi = hinglishCount(tokensOf(text)) > 0;
  const mix = voice.language?.mix ?? { en: 1 };
  if (usesHindi && !mix.hi_latn && !mix.hi) problems.push('uses Hindi words, which this person never uses');
  if (usesHindi && plan.language?.primary === 'en' && !plan.language.codeSwitch) problems.push('the plan says English only this time');
  // Same first two words as a recent message ("Arre yaar, …" ×13 in sim h): vary how messages start.
  const start = (t) => words(ascii(t)).slice(0, 2).join(' ').toLowerCase();
  if (words(text).length >= 3 && recentTexts.some((t) => start(t) === start(text))) problems.push(`starts like a recent message ("${start(text)}"); open differently`);
  const echo = echoOf(text, recentTexts);
  if (echo) problems.push(`repeats earlier phrasing ("${echo}")`);
  // Reordered mirroring ("sunrise trek to sinhagad then misal" → "sinhagad sunrise trek then misal") slips past the
  // 5-gram check: most of my content words coming straight from their last message is still echoing (first v2 run).
  const mine = [...new Set(contentWords(text))];
  const theirLast = new Set(contentWords(recentTexts.at(-1) ?? ''));
  if (mine.length >= 3 && mine.filter((w) => theirLast.has(w)).length / mine.length >= 0.6) problems.push('mirrors their last message; react in your own words and add something new');
  if (MEETING.test(text)) problems.push("makes real-world plans; the agent never arranges to meet (say you'd like to keep chatting here first)");
  const scan = scanMessage(text);
  if (scan.severity >= 2) problems.push(`shares contact details or talks about money (${scan.flags.join(', ')})`);
  return problems;
}

/** Cosmetic drift from the plan (recorded on the message, never regenerated). */
export function styleNotes(text, plan) {
  const notes = [];
  const n = words(text).length;
  const target = plan.targetWords * (plan.burst ?? 1);
  if (n > target * 1.4 + 3) notes.push(`long (${n} vs ~${target} words)`);
  if (n < target * 0.6 - 2) notes.push(`short (${n} vs ~${target} words)`);
  if (!plan.askBack && text.trim().endsWith('?') && !plan.opening) notes.push('asked a question the plan did not call for');
  if (plan.emoji && !EMOJI.test(text)) notes.push('skipped the planned emoji');
  return notes;
}

/** Sentences that state something about ME (not reactions, questions or honest "never tried it"). */
/** Hedges about myself ("haven't tried", "don't follow"): the agent didn't know, so my human should be asked. */
export const hedgeSentences = (text) => sentencesOf(ascii(text)).filter((s) => HONEST.test(s));

export const selfClaimSentences = (text) => sentencesOf(ascii(text)).filter((s) => FIRST_PERSON.test(s) && !REACTION.test(s) && !INTERROGATIVE.test(s) && !HONEST.test(s));

/**
 * Grounding in code (Checkpoint A: no extra LLM call). claims: [{ text, factIds, stance }] the generator listed for
 * every first-person claim; aboutThem: [{ text, sourceIds }] for every statement about the other person.
 * facts: Map(id → fact) of what the prompt listed; sources: Set of note/profile ids; theirTexts: their messages.
 * → { problems, drop: [sentences], unknownAboutMe: [sentences about likes to ask my human] }
 */
export function groundingCheck({ text, claims = [], aboutThem = [], facts, sources = new Set(), theirTexts = [], myLikes = [] }) {
  text = ascii(text);
  claims = claims.map((c) => ({ ...c, text: ascii(c.text) }));
  aboutThem = aboutThem.map((a) => ({ ...a, text: ascii(a.text) }));
  const problems = [], drop = new Set();
  const valid = [];
  // "Never tried X" is honest only if X isn't something I'm on record as liking (myLikes: labels of ALL my likes).
  const likedIn = (s) => myLikes.find((l) => l.length >= 4 && norm(s).join(' ').includes(norm(l).join(' ')));
  for (const s of sentencesOf(text).filter((x) => HONEST.test(x) && likedIn(x))) { problems.push(`says "${s}" but you like ${likedIn(s)}`); drop.add(s); }
  for (const c of claims) {
    if (!c.factIds?.length && HONEST.test(c.text)) { if (!likedIn(c.text)) valid.push(c); continue; }
    const bad = (c.factIds ?? []).filter((id) => !facts.has(id));
    if (!c.factIds?.length || bad.length) { problems.push(`"${c.text}" cites ${bad.length ? `unknown facts (${bad.join(', ')})` : 'no fact'}`); continue; }
    const contra = c.factIds.map((id) => facts.get(id)).find((f) => ['likes', 'dislikes', 'opinion'].includes(f.predicate)
      && ((c.stance === 'positive' && (f.polarity === -1 || f.predicate === 'dislikes')) || (c.stance === 'negative' && f.polarity !== -1 && f.predicate !== 'dislikes')));
    if (contra) { problems.push(`"${c.text}" contradicts "${contra.object}"`); continue; }
    valid.push(c);
  }
  const unsupported = [];
  for (const s of sentencesOf(text)) {
    // Per clause: "drawing's been with me since i was a kid — coffee and chai are both great" must not pass because
    // the second half matches a valid claim (first v2 run).
    const bad = clausesOf(s).filter((c) => FIRST_PERSON.test(c) && !REACTION.test(c) && !INTERROGATIVE.test(c) && !HONEST.test(c) && !valid.some((v) => covers(v.text, c)));
    if (bad.length) {
      unsupported.push(...bad);
      drop.add(s);
    }
    if (YOU_CLAIM.test(s) && !s.trim().endsWith('?') && !REACTION.test(s)) {
      const theirWords = new Set(theirTexts.flatMap(contentWords));
      const ok = aboutThem.some((a) => covers(a.text, s) && (a.sourceIds ?? []).some((id) => (id === 'T' ? contentWords(a.text).some((w) => theirWords.has(w)) : sources.has(id))));
      // A reaction to their own words ("your sunday sounds perfect") is grounded by the transcript itself.
      if (!ok && !contentWords(s).some((w) => theirWords.has(w))) { problems.push(`says something about them nobody said: "${s}"`); drop.add(s); }
    }
  }
  if (unsupported.length) problems.push(`claims about me with no fact behind them: ${unsupported.map((s) => `"${s}"`).join('; ')}. List each one in "claims" with the id of the fact that supports it (e.g. a trekking fact), or remove it`);
  return { problems, drop: [...drop], unsupported };
}

/**
 * Leak check (code, every outgoing message): a sentence leaks a private fact if it shares ≥ 2 of the fact's
 * distinctive words, or its embedding is ≥ T_LEAK similar. privateFacts: [{ object, vector }]; vectors: per sentence.
 */
export function leakCheck(sentences, privateFacts, sentenceVectors = []) {
  const leaks = [];
  sentences.forEach((s, i) => {
    const sw = new Set(contentWords(s));
    const hit = privateFacts.find((f) => contentWords(f.object).filter((w) => sw.has(w)).length >= 2
      || (f.vector && sentenceVectors[i] && cosine(sentenceVectors[i], f.vector) >= KG.T_LEAK));
    if (hit) leaks.push({ sentence: s, fact: hit.object });
  });
  return leaks;
}

/** Only when the plan says I must disagree: does the draft agree or concede? (LLM, tier fast, reasoning off.) */
export async function stanceCheck({ draft, disagreeOn, userId, matchId }) {
  try {
    const out = await chatJSON({ tier: 'fast', reasoning: false, temperature: 0, purpose: 'agent-stance-check', userId, matchId,
      schema: z.object({ concedes: z.boolean() }), messages: stancePrompt.build({ draft, disagreeOn }) });
    return out.concedes ? [`it agrees with or concedes "${disagreeOn}", but you hold the opposite view firmly`] : [];
  } catch (err) {
    // Fail open: a soft check must not kill the reply (sim g: 3 timeouts on the free tier stopped the whole chat).
    if (err.name === 'BudgetExceededError') throw err;
    console.warn(`stance check skipped (${err.code ?? err.name}): ${err.message}`);
    return [];
  }
}
