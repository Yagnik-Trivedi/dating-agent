// Step 2 (plan 07): the viewer's brief on a new match. Inputs: the match's PUBLIC profile (allowed here, like a human
// reading it) + the viewer's OWN graph and voice. No code compares the two users' facts or vectors, and nothing about
// the match is stored as a fact: notes come only from the transcript (plan 08).
import { z } from 'zod';
import { env } from '../../config/env.js';
import { KgFact } from '../../models/KgFact.js';
import { Profile, PUBLIC_PROFILE } from '../../models/Profile.js';
import { User } from '../../models/User.js';
import { VoiceProfile } from '../../models/VoiceProfile.js';
import { VoiceSample } from '../../models/VoiceSample.js';
import { items } from '../../utils/zodItems.js';
import { asActor } from '../actor.js';
import { KG } from '../kg/config.js';
import { agendaAttribute, TOPICS } from '../kg/questionnaireFacts.js';
import { BASICS, hiddenBasics } from '../match/gate.js';
import { chatJSON } from '../llm/client.js';
import * as matchBrief from '../prompts/matchBrief.js';
import { selfClaimSentences } from '../persona/checks.js';
import { publicProfile } from '../trust/checkProfile.js';
import { debug } from '../../utils/log.js';

const AGENDA_SIZE = 8;
const CLARIFY_PRIORITY = 0.6;
const MY_FACTS = 12;
const WHY = { dealbreaker: 'A dealbreaker for you', values: 'Matters to you', goal: 'Your long-term plans', lifestyle: 'Your day-to-day', likes: 'Something you love', clarify: 'Gentle clarification from the trust check' };
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Agenda from MY graph only (plan 07 §5): what this chat should uncover about them.
 * B dealbreakers first (priority 1), other B answers by importance, my top 5 likes (0.5 × strength), trust clarify
 * topics (0.6). Private facts never become topics; if_asked ones (religion) only when I made them a dealbreaker.
 * need (plan 31, CONVO_MODE=human): needToAsk's inputs; then almost every item is settled or removed before the chat.
 */
export function buildAgenda({ self, clarify = [], need = null }) {
  const byTopic = new Map();
  const add = (topic, why, priority, extra = {}) => {
    const key = topic.toLowerCase();
    const cur = byTopic.get(key);
    if (!cur || priority > cur.priority) byTopic.set(key, { topic, why, priority, ...extra });
  };
  for (const f of self.filter((x) => x.attribute && ['values', 'goal', 'lifestyle'].includes(x.predicate) && x.disclosure !== 'private')) {
    if (f.isDealbreaker) add(TOPICS[f.attribute] ?? f.attribute, WHY.dealbreaker, 1, { dealbreaker: true, attribute: f.attribute, value: f.value });
    else if (f.disclosure === 'public') add(TOPICS[f.attribute] ?? f.attribute, WHY[f.predicate], f.importance ?? 0.5, { attribute: f.attribute, value: f.value });
  }
  // Short likes only: story-length ones ("naming haworthia blindfolded") made odd topics and crowded the agenda (eval i2).
  self.filter((f) => f.predicate === 'likes' && f.polarity !== -1 && f.disclosure === 'public' && f.object.split(/\s+/).length <= 3)
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0)).slice(0, 5)
    .forEach((f) => add(f.object, WHY.likes, 0.5 * (f.strength ?? 0.5), { kind: 'interest' }));
  for (const topic of clarify) add(topic, WHY.clarify, CLARIFY_PRIORITY, { kind: 'clarify' });
  const items = [...byTopic.values()].sort((a, b) => b.priority - a.priority)
    .map((a) => ({ topic: a.topic, why: a.why, priority: r2(a.priority), confidence: 0, status: 'open', ...(a.dealbreaker && { dealbreaker: true }), ...(a.attribute && { attribute: a.attribute }),
      ...(need && { ...(a.value && { value: a.value }), ...(a.kind && { kind: a.kind }) }) }));
  return capAgenda(need ? needToAsk(items, need) : items);
}

// Settled items (known, for you) stay in the agenda outside the size cap: the judge and the room's panel read them.
const settled = (a) => a.status === 'for_you' || Boolean(a.settledBy);
const capAgenda = (list) => [...list.filter((a) => !settled(a)).slice(0, AGENDA_SIZE), ...list.filter(settled)].map(({ id, ...a }, i) => ({ id: `a${i + 1}`, ...a }));

const words = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ');
const listed = (a, attr, list = []) => list.some((x) => words(x) === words(attr) || (words(a.topic).includes(words(x)) && words(x).length >= 4));
const tagValue = (tags, path) => path.split('.').reduce((o, k) => o?.[k], tags);

/**
 * Plan 31 A3, "Do I even need to ask this?" Code only, once per brief, in order:
 * 1. my dealbreaker the gate already checked → answered (gate); 2. shown on their public profile → answered (profile),
 * with their value and whether it differs from mine; 3. not a dealbreaker and below ASK_MIN_IMPORTANCE → removed;
 * 4. humans-only, "leave for me", private/if_asked for me, hidden by me, or a basic their profile doesn't show → for you;
 * 5. the rest → askOnce (0–2 in practice). Interests and clarify topics stay as talk material.
 * theirTags: their PUBLIC Profile.tags; gateDealbreakers: MY profile.gate.dealbreakers (the judge's source too).
 */
export function needToAsk(agenda, { theirTags = {}, gateDealbreakers = [], leaveForMe = [], myPrivateTopics = [], myHidden = [] } = {}) {
  return agenda.flatMap((a) => {
    const attr = agendaAttribute(a);
    if (a.kind === 'interest' || a.kind === 'clarify') return [a];
    if (a.dealbreaker && attr && gateDealbreakers.includes(attr)) return [{ ...a, status: 'answered', settledBy: 'gate' }];
    const shown = attr && BASICS[attr] ? tagValue(theirTags, BASICS[attr]) : null;
    if (shown) return [{ ...a, status: 'answered', settledBy: 'profile', profileValue: shown, differs: Boolean(a.value) && a.value !== shown }];
    if (!a.dealbreaker && a.priority < KG.ASK_MIN_IMPORTANCE) return [];
    const forYou = listed(a, attr, KG.HUMANS_ONLY.attributes) || listed(a, attr, KG.HUMANS_ONLY.topics) || listed(a, attr, leaveForMe)
      || (attr && (myPrivateTopics.includes(attr) || myHidden.includes(attr) || BASICS[attr]));
    return [forYou ? { ...a, status: 'for_you' } : { ...a, askOnce: true }];
  });
}

/**
 * The brief now runs in parallel with the trust check (plan 30 S1), so the trust check's gentle "clarify" topics join
 * the agenda afterwards, exactly as buildAgenda would have placed them (priority CLARIFY_PRIORITY, size cap kept).
 */
export function addClarify(agenda = [], trust) {
  const have = new Set(agenda.map((a) => a.topic.toLowerCase()));
  const human = agenda.some((a) => a.kind || settled(a) || a.askOnce); // built with needToAsk (CONVO_MODE=human)
  const extra = (trust?.contradictions ?? []).filter((c) => c.severity <= 2 && !have.has(c.topic.toLowerCase()))
    .map((c) => ({ topic: c.topic, why: WHY.clarify, priority: CLARIFY_PRIORITY, confidence: 0, status: 'open', ...(human && { kind: 'clarify' }) }));
  if (!extra.length) return agenda;
  return capAgenda([...agenda.filter((a) => !settled(a)), ...extra].sort((a, b) => b.priority - a.priority).concat(agenda.filter(settled)));
}

// Real sentences only: "yes please." and a trailing "😄" are chat fragments, not sentences (they dropped good openers).
const sentences = (s) => s.split(/[.!?]+(?:\s|$)/).filter((x) => (x.match(/[\p{L}\p{N}]+/gu) ?? []).length >= 3).length;

/** Openers: ≤ 2 sentences; anything about me must cite listed fact ids (validated here, as in plan 08's grounding). */
export function validOpeners(openers, factIds, log = () => {}) {
  // ≤ 3 short sentences within 40 words: two chatty lines + a question was the norm, and a strict 2 dropped most.
  const why = (o) => (sentences(o.text) > 3 || o.text.split(/\s+/).length > 40 ? 'too long for an opener'
    : !o.factIds.every((id) => factIds.has(id)) ? 'cites an unknown fact'
      : selfClaimSentences(o.text).length && !o.factIds.length ? 'talks about the user without citing a fact' : null);
  return openers.filter((o) => {
    const reason = why(o);
    if (reason) log(`brief: opener dropped (${reason}): "${o.text}"`);
    return !reason;
  }).slice(0, 3);
}

const briefSchema = z.object({
  summary: z.string().max(600).catch(''),
  openers: items(z.object({ text: z.string().trim().min(1).max(300), hook: z.string().trim().max(120).catch(''), factIds: z.array(z.string()).catch([]) })),
  watchouts: z.array(z.string().max(200)).catch([]),
});

/** viewer's brief on subject. → { summary, openers, watchouts, agenda, builtAt } (stored on match.brief[viewer]). */
export const buildBrief = ({ viewerId, subjectId, matchId, trust, viewerName }) => asActor({ role: 'brief', userId: viewerId, otherId: subjectId }, async () => {
  const human = env.CONVO_MODE === 'human';
  const [profile, self, voice, samples, myProfile, me] = await Promise.all([
    Profile.findOne({ userId: subjectId }).select(PUBLIC_PROFILE).lean(),
    KgFact.find({ subjectId: viewerId, observerId: null, predicate: { $nin: ['trait', 'style'] } }).lean(),
    VoiceProfile.findOne({ userId: viewerId }, { description: 1, doList: 1, dontList: 1 }).lean(),
    VoiceSample.find({ userId: viewerId, mood: { $in: ['greeting', 'tease', 'casual', 'curious'] } }, { text: 1 }).sort({ createdAt: -1 }).limit(4).lean(),
    human ? Profile.findOne({ userId: viewerId }, { 'gate.dealbreakers': 1, tagsHidden: 1 }).lean() : null, // MY profile
    human ? User.findById(viewerId, { 'settings.leaveForMe': 1 }).lean() : null,
  ]);
  if (!profile) throw new Error('subject profile missing');
  const clarify = (trust?.contradictions ?? []).filter((c) => c.severity <= 2).map((c) => c.topic);
  // Plan 31 A3: their public basics, my gate-checked dealbreakers, my own private topics and choices. Nothing stored about them.
  const need = human && {
    theirTags: profile.tags ?? {}, gateDealbreakers: myProfile?.gate?.dealbreakers ?? [], leaveForMe: me?.settings?.leaveForMe ?? [],
    myPrivateTopics: self.filter((f) => f.attribute && f.disclosure !== 'public').map((f) => f.attribute), myHidden: hiddenBasics(myProfile),
  };
  const agenda = buildAgenda({ self, clarify, need });

  // My sayable facts for openers: public only, most important first.
  const mine = self.filter((f) => f.disclosure === 'public' && f.predicate !== 'reflection')
    .sort((a, b) => Math.max(b.importance ?? 0, b.strength ?? 0) - Math.max(a.importance ?? 0, a.strength ?? 0)).slice(0, MY_FACTS);
  const factIds = new Map(mine.map((f, i) => [`F${i + 1}`, f._id]));
  const style = [voice?.description, voice?.doList?.length && `Do: ${voice.doList.join('; ')}`, voice?.dontList?.length && `Don't: ${voice.dontList.join('; ')}`].filter(Boolean).join('\n');
  let written = { summary: '', openers: [], watchouts: [] };
  try {
    const out = await chatJSON({
      tier: 'mid', reasoning: false, schema: briefSchema, purpose: 'brief', userId: viewerId, matchId,
      messages: matchBrief.build({
        userName: viewerName, profile: publicProfile(profile), myFacts: mine.map((f, i) => `[F${i + 1}] ${f.predicate}: ${f.object}`),
        agendaTopics: agenda.filter((a) => !settled(a)).slice(0, 5).map((a) => a.topic), style, exemplars: samples.map((s) => s.text),
      }),
    });
    // Models sometimes paste a fact id into the text ("… lately? F4"): strip it before validating.
    const cleaned = out.openers.map((o) => ({ ...o, text: o.text.replace(/\s*\[?\bF\d+\b\]?/g, '').trim() }));
    const openers = validOpeners(cleaned, new Set(factIds.keys()), debug).map((o) => ({ text: o.text, hook: o.hook, usedFactIds: o.factIds.map((id) => factIds.get(id)) }));
    written = { summary: out.summary, openers, watchouts: out.watchouts.slice(0, 3) };
  } catch (err) {
    if (err.name === 'BudgetExceededError') throw err;
    console.error(`brief: summary unavailable (${err.code ?? err.name}): ${err.message}`); // the agent writes its own opener (plan 08)
  }
  return { ...written, agenda, builtAt: new Date() };
});
