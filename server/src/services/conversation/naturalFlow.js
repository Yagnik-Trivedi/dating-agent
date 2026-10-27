// Plan 34 (FLOW=natural): how real chats flow, in code. A casual start (greeting → warmup → flow → winding_down), few
// questions, threads that run their course, a lead that moves between the two people, reactions with feeling, nothing
// ignored, and endings whose warmth follows the vibe. Everything here is derived from the transcript, my own graph and
// the seeded rng, so it works the same when the other side is a human, and replays the same.
import { KG } from '../kg/config.js';
import { rng as seeded } from '../../utils/rng.js';

const N = KG.NATURAL;
const words = (s) => String(s ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const pick = (xs, rng) => xs[Math.floor(rng() * xs.length)];
const between = ([lo, hi], r) => lo + Math.floor(r * (hi - lo + 1));

// Generic get-to-know questions (an interview, not a chat): at most GETTOKNOW_PER_SESSION, never in greeting/warmup.
export const GETTOKNOW = /\b(what do (you|u) (do|like to do)( for fun| in your free time| on (the )?weekends)|what are (your|ur) hobbies|any hobbies|where are (you|u) from|where('?s| is) home for (you|u)|what kind of (music|movies|films|books|food|shows)|tell me (a bit |more )?about (yourself|urself)|what('?s| is) (your|ur) fav(ou?rite)?\b|(your|ur) fav(ou?rite)? (movie|film|song|food|book|place|colou?r|show)|what are (you|u) looking for|what brings (you|u) (here|on here|to this app)|what do (you|u) do for (a living|work))/i;

/** The phase of MY side in this session: greeting (first 2 of my messages), warmup, flow, winding_down. */
export function phaseOf({ myCount, warmup, closing }) {
  if (closing) return 'winding_down';
  if (myCount < N.GREETING_MSGS + 1) return 'greeting';
  return myCount < N.GREETING_MSGS + 1 + warmup ? 'warmup' : 'flow';
}

/** How many more question-messages I may send now: at most QUESTION_WINDOW_MAX in any QUESTION_WINDOW in a row. */
export function questionBudget(history, me) {
  const recent = history.slice(-(N.QUESTION_WINDOW - 1));
  return Math.max(0, N.QUESTION_WINDOW_MAX - recent.filter((m) => String(m.senderId) === me && String(m.text).includes('?')).length);
}

/**
 * Who carries the conversation (A3), recomputed from the whole transcript each time: both agents (or an agent and a
 * human) see the same value. From the first message after `from`: the first substantial message takes the lead; a
 * follower's bigger, newer message takes it over; a leader who runs out (short message) or whose sampled stint is up
 * passes it. Never after fewer than LEAD_MIN_STINT messages (no strict alternation; one person may lead twice).
 * → { lead: userId | null, since, stint, len, lastLeader: text }
 */
export function leadOf(history, { seed = 1, from = 0 } = {}) {
  let lead = null, since = from, stint = 0, lastLeader = '';
  const stintAt = (i) => between(N.LEAD_STINT, seeded((seed + i * 31) >>> 0)());
  for (let i = from; i < history.length; i++) {
    const m = history[i];
    const who = String(m.senderId);
    const n = words(m.text);
    if (!lead) {
      if (n >= 8) { lead = who; since = i; stint = stintAt(i); lastLeader = m.text; }
      continue;
    }
    const len = i - since;
    if (who !== lead) {
      if (len >= N.LEAD_MIN_STINT && n >= N.LEAD_TAKE_WORDS && n > words(lastLeader)) { lead = who; since = i; stint = stintAt(i); lastLeader = m.text; }
    } else {
      lastLeader = m.text;
      if (len >= N.LEAD_MIN_STINT && (n <= N.LEAD_RUN_OUT_WORDS || len >= stint)) {
        const other = history.slice(from).map((x) => String(x.senderId)).find((u) => u !== who) ?? null;
        lead = other; since = i + 1; stint = stintAt(i + 1); lastLeader = '';
      }
    }
  }
  return { lead, since, stint, len: history.length - since, lastLeader };
}

/**
 * The current thread (A2): kept while it has energy and hasn't run its sampled length; otherwise the next topic seed
 * becomes the thread, reached through a bridge. → { thread, changed, bridge }
 */
export function nextThread(prev, { seeds = [], msgCount, lowEnergy = false, me, theirId, seed = 1 }) {
  const age = prev ? msgCount - prev.startedAt : Infinity;
  const live = prev && age < prev.target && !(lowEnergy && age >= 2);
  if (live) return { thread: prev, changed: false, bridge: false };
  const topic = seeds.find((s) => !prev || s.toLowerCase() !== String(prev.topic).toLowerCase());
  if (!topic) return { thread: prev ?? null, changed: false, bridge: false };
  const target = between(N.THREAD_MESSAGES, seeded((seed + msgCount * 131) >>> 0)());
  return { thread: { topic, startedBy: theirId ?? me, startedAt: msgCount, target }, changed: true, bridge: Boolean(prev) };
}

const NEWS_WIN = /\b(got (in|into|selected|promoted|the job|the offer)|passed|cleared|promotion|finished|won|completed|launched)\b/i;

/**
 * How I feel about what they said (A4), from MY graph and their read. → [{ text, feeling }] (at most 3, strongest first)
 * feelings: love, like, meh, dislike, amused, surprised, impressed, relate, empathetic, shy, tease, disagree
 */
export function feelingsOf({ perception = {}, voice = {}, extraversion = 0.5, mood }) {
  const out = [];
  for (const c of perception.concepts ?? []) {
    const own = c.own;
    if (!own) continue;
    if (own.polarity !== c.polarity) out.push({ text: c.text, feeling: 'dislike' });
    else if (['background', 'story'].includes(own.predicate)) out.push({ text: c.text, feeling: 'relate' });
    else out.push({ text: c.text, feeling: own.strength >= 0.75 ? 'love' : own.strength >= 0.5 ? 'like' : 'meh' });
  }
  for (const r of perception.reactTo ?? []) {
    if (out.some((x) => x.text.toLowerCase() === r.text.toLowerCase())) continue;
    if (r.kind === 'joke' && perception.humor) out.push({ text: r.text, feeling: 'amused' });
    else if (r.kind === 'news') out.push({ text: r.text, feeling: NEWS_WIN.test(r.text) ? 'impressed' : 'surprised' });
    else if (r.kind === 'compliment') out.push({ text: r.text, feeling: (voice.laughRate ?? 0) > 0.3 && extraversion >= 0.5 ? 'tease' : 'shy' });
    else if (r.kind === 'tease') out.push({ text: r.text, feeling: 'tease' });
    else if (['complaint', 'confession'].includes(r.kind) && ['down', 'tired'].includes(mood)) out.push({ text: r.text, feeling: 'empathetic' });
  }
  if (perception.mustDisagreeOn) out.unshift({ text: perception.mustDisagreeOn, feeling: 'disagree' });
  if (!out.length && ['down'].includes(mood)) out.push({ text: 'how they feel', feeling: 'empathetic' });
  const rank = { disagree: 0, empathetic: 1, love: 2, impressed: 3, surprised: 4, amused: 5, dislike: 6, relate: 7, tease: 8, shy: 9, like: 10, meh: 11 };
  return out.sort((a, b) => rank[a.feeling] - rank[b.feeling]).slice(0, 3);
}

const TAPBACK_OF = { love: '❤️', like: '❤️', relate: '❤️', amused: '😂', surprised: '😮', impressed: '🔥', empathetic: '😢' };
/** An agent tapback (A4.1) on their last bubble: about 15–25% of turns by my emoji rate, never a negative one. */
export function tapbackFor({ feelings = [], mood, voice = {}, rng }) {
  const [lo, hi] = N.TAPBACK_RATE;
  if (rng() >= lo + (hi - lo) * Math.min(1, voice.emojiPerMessage ?? 0)) return null;
  const f = feelings.find((x) => TAPBACK_OF[x.feeling]);
  return f ? TAPBACK_OF[f.feeling] : mood === 'down' ? '😢' : null;
}

/** How proper the ending is (A6). */
export const endVibe = (interest = 0.5, { dealbreaker = false, judgeLean = null } = {}) =>
  (dealbreaker || judgeLean === 'no' || interest <= N.END_COOL ? 'cool' : interest >= N.END_WARM ? 'warm' : 'neutral');

const hourIn = (tz, now) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now));
/**
 * A real excuse that invents nothing (A6): the time of day in the user's time zone, plus a fact the user really has
 * (a job, a gym habit, studies), else generic. → { text, source }
 */
export function excuseFor({ facts = [], now = new Date(), tz = N.DEFAULT_TZ } = {}) {
  const h = hourIn(tz, now);
  const has = (re) => facts.some((f) => re.test(`${f.object ?? ''} ${f.conceptLabel ?? ''}`));
  const job = facts.some((f) => f.attribute === 'job');
  const gym = has(/\b(gym|workout|work out|lifting|yoga|running)\b/i);
  const study = has(/\b(exams?|mid-?sems?|studying|study|college|university|semester|assignments?)\b/i);
  if (h >= 22 || h < 5) return job ? { text: 'need to sleep, early start tomorrow', source: 'night+job' } : { text: 'need to sleep', source: 'night' };
  if (h < 11) return { text: job ? 'getting ready for work' : 'getting ready for the day', source: job ? 'morning+job' : 'morning' };
  if (h < 17) return study ? { text: 'need to get back to studying', source: 'study' } : job ? { text: 'got to get back to work', source: 'job' } : { text: 'got some stuff to finish up', source: 'generic' };
  return gym ? { text: 'heading to the gym', source: 'gym' } : study ? { text: 'need to study for a bit', source: 'study' } : { text: 'going to grab dinner', source: 'evening' };
}

/** Words an excuse may not bring in unless the excuse itself or a fact has them (no invented people, places, events). */
export const INVENTED_EXCUSE = /\b(mom|mum|mummy|maa|dad|papa|mother|father|sister|brother|cousin|friends?|roommate|boss|meeting|party|wedding|flight|doctor|appointment|guests?)\b/i;
export const BARE_BYE = /^\s*(ok(ay)?[,!. ]*)?(bye+|byee+|cya|see ya|gn|good ?night|ttyl)[!. 👋🙂😊]*$/i;
export const TALK_LATER = /\b(talk (to you )?(later|tomorrow|tmrw|soon)|ttyl|catch (you|u) later|text (you|u) (later|tomorrow)|speak soon)\b/i;

/** A casual first message from the user's own greeting words (A1); no model call, no fixed template line. */
export function greetingFor({ voice = {}, samples = [], rng, theirName, now = new Date(), tz = N.DEFAULT_TZ, lower = true }) {
  const own = samples.map((s) => String(s.text ?? '').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '')).filter((w) => /^(h+e+y+|h+i+|hello+|yo+|heya|hola)$/.test(w ?? ''));
  const g = own.length ? pick(own, rng) : pick(['hey', 'hii', 'heyy'], rng);
  const h = hourIn(tz, now);
  const part = h < 12 ? 'morning' : h < 17 ? 'day' : 'evening';
  const shapes = [`${g}! how's your ${part} going?`, `${g} ${theirName}! how's it going?`, `${g}! how was your day?`, `${g} ${theirName}, how's your week been?`, `${g}! how's your ${part} been?`];
  let line = pick(shapes, rng);
  if (voice.topEmojis?.length && rng() < Math.min(1, voice.emojiPerMessage ?? 0)) line += ` ${voice.topEmojis[0]}`;
  return lower ? line : line.charAt(0).toUpperCase() + line.slice(1);
}

/** Off-limits for my agent (A5): "leave for me" choices, the humans-only list and my private facts. → the topic | null */
export function offLimitsIn(text, { leaveForMe = [], privateFacts = [] } = {}) {
  const t = String(text ?? '').toLowerCase();
  const ALIASES = { exes: /\b(ex|exes|ex-?(boyfriend|girlfriend|bf|gf)|last relationship|past relationships?)\b/, salary: /\b(salary|how much (do )?(you|u) (earn|make)|package|ctc)\b/, politics: /\b(politics|political|modi|bjp|congress|elections?|vote|voted)\b/, religion: /\b(religio\w*|god|temple|pray\w*)\b/, money: /\b(money|savings|earn)\b/, health: /\b(health|medical|illness|therapy|medication)\b/ };
  const topics = [...new Set([...leaveForMe, ...KG.HUMANS_ONLY.topics].map((x) => String(x).toLowerCase().trim()).filter(Boolean))];
  for (const topic of topics) {
    const re = ALIASES[topic] ?? new RegExp(`\\b${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(t)) return topic;
  }
  const priv = privateFacts.find((f) => String(f.object ?? '').toLowerCase().split(/\W+/).filter((w) => w.length >= 5).some((w) => t.includes(w)));
  return priv ? 'something personal' : null;
}

/**
 * The natural layer on top of plan 31's human plan (mutates and returns plan). ctx: { history, me, otherId, state,
 * perception, voice, persona, rng, seed, limits, msgCount, sessionStart, flow, hooks, leaveForMe, theirText, now, tz }
 */
export function naturalize(plan, ctx) {
  const { history, me, otherId, state, perception = {}, voice = {}, persona = {}, rng, seed, limits = {}, msgCount = 0, sessionFrom = 0, flow = {}, hooks = [], leaveForMe = [], theirText = '', now, tz } = ctx;
  plan.flow = 'natural';
  const inSession = history.slice(sessionFrom);
  const myCount = inSession.filter((m) => String(m.senderId) === me).length;
  const warmup = between(N.WARMUP_MSGS, seeded((seed ^ 0x77a1 + sessionFrom) >>> 0)());
  // Endings: a pre-close one message before the end; the end itself only after it.
  const lastMine = (limits.maxMessages ?? Infinity) <= msgCount + 1;
  const nearEnd = !plan.end && (msgCount + 3 >= (limits.maxMessages ?? Infinity) || (state.lowInterestTurns ?? 0) === KG.END_AFTER_LOW_TURNS - 1);
  if (plan.end === 'natural' && !state.preClosed) { plan.end = null; plan.preClose = true; } // natural end only after a pre-close
  else if (nearEnd && !lastMine) plan.preClose = true;
  plan.phase = phaseOf({ myCount, warmup, closing: Boolean(plan.end || plan.preClose) });
  // The lead, shared and derived from the transcript (from where this session's warmup ended).
  const lead = leadOf(history, { seed, from: sessionFrom });
  plan.lead = plan.phase === 'flow' ? (lead.lead === me ? 'me' : lead.lead ? 'them' : 'nobody') : 'nobody';
  plan.handover = plan.lead === 'me' && lead.len + 1 >= lead.stint && rng() < N.LEAD_HANDOVER;
  // Questions (A2): rare, never alone outside greeting/warmup, within the window; none on a close or pre-close.
  const budget = questionBudget(history, me);
  const pAsk = plan.phase === 'greeting' ? 0.9 : plan.phase === 'warmup' ? 0.5 : plan.lead === 'them' ? N.ASK_MAX * 0.8 : N.ASK_MAX;
  plan.askBack = !plan.end && !plan.preClose && budget > 0 && !(state.lastAsked && !perception.isQuestion) && (plan.phase === 'greeting' || rng() < pAsk);
  if (plan.topic?.kind === 'agenda' && (plan.phase !== 'flow' || budget === 0)) plan.topic = null; // the one matching question only in flow
  plan.getToKnowLeft = Math.max(0, N.GETTOKNOW_PER_SESSION - (state.getToKnow?.[String(sessionFrom)] ?? 0));
  readParts(plan, ctx);
  // Ending style and a real excuse (A6).
  if (plan.end || plan.preClose) {
    plan.vibe = endVibe(state.interest ?? 0.5, { dealbreaker: plan.end === 'dealbreaker_hint' });
    plan.excuse = excuseFor({ facts: persona.facts ?? [], now, tz }).text;
  }
  // Move: a pre-close finishes the thread; in flow the follower reacts, the leader shares.
  if (plan.preClose) plan.move = 'pre_close';
  else if (!plan.end && plan.phase === 'greeting') plan.move = 'greet_back';
  else if (!plan.end && plan.phase === 'flow' && !['reply', 'stay', 'think', 'not_sure', 'callback'].includes(plan.move)) {
    plan.move = plan.lead === 'me' ? (plan.handover ? 'hand_over' : 'lead') : plan.lead === 'them' ? 'follow' : rng() < 0.5 ? 'react' : 'share';
  }
  return plan;
}

/** The parts that depend on their read (refreshed after a merged read): feelings, tapback, thread, lull, hook, decline, light ack. */
export function readParts(plan, ctx) {
  const { state, perception = {}, voice = {}, persona = {}, rng, seed, msgCount = 0, flow = {}, hooks = [], leaveForMe = [], theirText = '', me, otherId } = ctx;
  // Feelings (A4) and the tapback (A4.1).
  plan.feelings = feelingsOf({ perception: { ...perception, mustDisagreeOn: plan.mustDisagree ? plan.disagreeOn : null }, voice, extraversion: persona.traits?.extraversion ?? 0.5, mood: plan.read?.mood });
  plan.tapback = plan.end ? null : tapbackFor({ feelings: plan.feelings, mood: plan.read?.mood, voice, rng });
  // Threads (A2): kept while alive, else the next seed through a bridge; a lull gets something to react to.
  const seeds = [...(perception.topicSeeds ?? []), ...(perception.concepts ?? []).map((c) => c.text)];
  const t = nextThread(flow.thread, { seeds, msgCount, lowEnergy: plan.read?.energy === 'low', me, theirId: otherId, seed });
  plan.thread = t.thread ? { topic: t.thread.topic, age: msgCount - t.thread.startedAt, bridge: t.bridge, changed: t.changed } : null;
  plan.newThread = t.changed ? t.thread : null;
  const lull = plan.phase === 'flow' && !perception.isQuestion && words(theirText) < KG.LULL_WORDS && !plan.end;
  if (lull && !plan.topic) {
    const unusedHooks = hooks.filter((h) => !(state.hooksUsed ?? []).includes(h));
    plan.lull = pick(N.LULL_KINDS.filter((k) => k !== 'hook' || unusedHooks.length), rng);
    if (plan.lull === 'hook') plan.hook = unusedHooks[0];
  }
  // The brief's openers are hooks for the warmup (A1).
  if (plan.phase === 'warmup' && !plan.hook) plan.hook = hooks.find((h) => !(state.hooksUsed ?? []).includes(h)) ?? null;
  // Off-limits topics are declined kindly and redirected (A5).
  const off = perception.isQuestion || perception.aboutMeQuestion ? offLimitsIn(theirText, { leaveForMe, privateFacts: persona.privateFacts ?? [] }) : null;
  if (off) { plan.decline = off; plan.unknownTopic = null; }
  // A first, still-vague dealbreaker hint: acknowledge lightly and carry on; the judge records it (A5).
  if (perception.dealbreakerFirst && !plan.end) plan.lightAck = true;
  plan.items = (perception.items ?? []).slice(0, 6);
  return plan;
}
