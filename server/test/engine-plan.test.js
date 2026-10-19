// Plan 08: traitRules, updateInterest, planAct (stance, low interest → shorter + end, replay), reply language.
// Plan 30 SN: topics in the flow (bridge / lull), message moves, question rate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateInterest } from '../src/services/conversation/interest.js';
import { bridgesTo, pickLanguage, planAct } from '../src/services/conversation/planAct.js';
import { attributesIn } from '../src/services/persona/askedAboutMe.js';
import { KG } from '../src/services/kg/config.js';
import { traitRules } from '../src/services/persona/traitRules.js';
import { rng } from '../src/utils/rng.js';

const voice = { wordCounts: [6, 8, 10, 12, 9], burstiness: 0.2, questionBackRate: 0.5, emojiPerMessage: 0.6, topEmojis: ['😄', '🔥'], laughRate: 0.5, laughForms: { haha: 0.7, lol: 0.3 }, language: { mix: { en: 0.7, hi_latn: 0.3 }, codeSwitchRate: 0.3, switchTriggers: ['tease'], mirrorsLanguage: 0.8 } };

test('traitRules: only outside 0.4–0.7, never the trait itself', () => {
  assert.deepEqual(traitRules({ extraversion: 0.2, agreeableness: 0.5, openness: 0.9 }), ['short replies, few exclamation marks, rarely asks back', 'curious, enjoys playful hypotheticals']);
  assert.deepEqual(traitRules({ extraversion: 0.55 }), []);
});

test('updateInterest: likes raise, low effort lowers, low turns count up and reset', () => {
  const up = updateInterest({ interest: 0.5 }, { likes: [0.9] });
  assert.ok(up.interest > 0.5);
  let s = { interest: 0.31, lowInterestTurns: 0 };
  s = { ...s, ...updateInterest(s, { lowEffort: true, dislikes: [0.8] }) };
  assert.ok(s.interest < KG.LOW_INTEREST && s.lowInterestTurns === 1);
  s = { ...s, ...updateInterest(s, { likes: [1, 1, 1] }) };
  assert.equal(s.lowInterestTurns, 0);
});

test('planAct: a strong opinion → mustDisagree; a weak one may be conceded', () => {
  const strong = planAct({ state: { interest: 0.5, turn: 3 }, voice, perception: { conflicts: [{ text: 'dogs are overrated', ownStrength: 0.9 }] }, rng: rng(1) });
  assert.deepEqual([strong.mustDisagree, strong.disagreeOn], [true, 'dogs are overrated']);
  const weak = planAct({ state: { interest: 0.5, turn: 3 }, voice, perception: { conflicts: [{ text: 'x', ownStrength: 0.2 }] }, rng: rng(1) });
  assert.equal(weak.mustDisagree, false);
});

test('planAct: low interest → shorter messages, then end', () => {
  const avg = (interest) => { const r = rng(7); let n = 0; for (let i = 0; i < 200; i++) n += planAct({ state: { interest, turn: 3 }, voice, rng: r }).targetWords; return n / 200; };
  assert.ok(avg(0.1) < avg(0.9) * 0.6, `low ${avg(0.1)} vs high ${avg(0.9)}`);
  const end = planAct({ state: { interest: 0.1, lowInterestTurns: KG.END_AFTER_LOW_TURNS, turn: 6 }, voice, rng: rng(3) });
  assert.equal(end.end, 'interest');
  assert.equal(planAct({ state: { turn: 11 }, voice, rng: rng(3), msgCount: KG.MAX_TURNS - 1 }).end, 'max_turns');
  assert.equal(planAct({ state: { turn: 5 }, voice, rng: rng(3), perception: { dealbreakerHit: true } }).end, 'dealbreaker_hint');
});

test('seeded replay: same seed + same perceptions → identical act-plan sequence', () => {
  const perceptions = [{ humor: true, concepts: [{ text: 'trekking', own: { strength: 0.9, polarity: 1 } }] }, { conflicts: [{ text: 'remakes are better', ownStrength: 0.6 }] }, { language: { languages: ['hi_latn'] }, mood: 'tease' }];
  const run = (seed) => {
    const r = rng(seed);
    let state = { interest: 0.5, turn: 0, topicsTouched: [] };
    return perceptions.map((p, turn) => {
      state = { ...state, ...updateInterest(state, { likes: (p.concepts ?? []).map((c) => c.own.strength) }), turn };
      return planAct({ state, voice, perception: p, rng: r, agenda: [{ id: 'a1', topic: 'kids', priority: 1, status: 'open' }] });
    });
  };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
});

test('reply language: never outside my mix; mirrors at the configured rate', () => {
  const r = rng(11);
  for (let i = 0; i < 300; i++) {
    const l = pickLanguage({ mix: { en: 1 } }, ['hi_latn', 'gu_latn'], r);
    assert.equal(l.primary, 'en', 'an English-only user never answers in Hindi');
  }
  let mirrored = 0;
  for (let i = 0; i < 1000; i++) if (pickLanguage({ mix: { en: 0.8, hi_latn: 0.2 }, mirrorsLanguage: 0.8 }, ['hi_latn'], r).primary === 'hi_latn') mirrored++;
  // hi weighted up by 1 + 2 × 0.8 = 2.6: P(hi) = 0.52 / (0.52 + 0.8) ≈ 0.39 (more than the mix's 0.2, but no runaway)
  assert.ok(Math.abs(mirrored / 1000 - 0.39) < 0.05, `mirrored ${mirrored}/1000`);
});

// Plan 30 SN: agenda topics come up in the flow of the chat (a bridge or a lull), never on a timer or forced.
const flowAgenda = [
  { id: 'a1', topic: 'drinking', attribute: 'drinking', priority: 0.9, status: 'open' },
  { id: 'a2', topic: 'wants children', attribute: 'kids', priority: 0.6, status: 'open' },
];
const engaged = { theirs: 'haha yes, the sunrise from the top was unreal, we started at 4am and my legs are still dead', mine: 'wait you did the whole trek?' };
const toBar = { theirs: 'ended up at this new brewery with my friends after, it was so loud lol', mine: 'what did you do after the trek?' };

test('topics in the flow: nothing during the warm-up, nothing on a timer', () => {
  for (let turn = 0; turn < KG.WARMUP_TURNS; turn++) {
    assert.equal(planAct({ state: { interest: 0.6, turn }, voice, rng: rng(turn), agenda: flowAgenda, thread: toBar }).topic, null, `warm-up turn ${turn}`);
  }
  const r = rng(5);
  for (let turn = KG.WARMUP_TURNS; turn < 12; turn++) {
    const p = planAct({ state: { interest: 0.6, turn, lastTopicTurn: turn - KG.TOPIC_GAP_TURNS }, voice, rng: r, agenda: flowAgenda, thread: engaged });
    assert.notEqual(p.topic?.kind, 'agenda', `turn ${turn}: an engaged thread with nothing leading to a topic is never interrupted`);
  }
});

test('topics in the flow: a bridge in what was just said brings the topic up, but not twice in a row', () => {
  const p = planAct({ state: { interest: 0.6, turn: 3 }, voice, rng: rng(1), agenda: flowAgenda, thread: toBar });
  assert.deepEqual([p.topic?.id, p.topic?.how, p.move], ['a1', 'bridge', 'topic']);
  const soon = planAct({ state: { interest: 0.6, turn: 3, lastTopicTurn: 2 }, voice, rng: rng(1), agenda: flowAgenda, thread: toBar });
  assert.equal(soon.topic, null, `within ${KG.TOPIC_GAP_TURNS} turns of the last topic`);
});

test('topics in the flow: at a lull, an open topic (with a question); the gate-checked dealbreaker only through a bridge', () => {
  const lull = { theirs: 'haha nice', mine: 'i finally finished that book' };
  const p = planAct({ state: { interest: 0.6, turn: 4, lastTopicTurn: 1 }, voice, rng: rng(2), agenda: flowAgenda, thread: lull });
  assert.deepEqual([p.topic?.id, p.topic?.how, p.askBack], ['a1', 'lull', true]);
  const gated = [{ id: 'd1', topic: 'smoking', attribute: 'smoking', dealbreaker: true, priority: 1, status: 'open' }];
  assert.equal(planAct({ state: { interest: 0.6, turn: 4, lastTopicTurn: 1 }, voice, rng: rng(2), agenda: gated, thread: lull }).topic, null, 'never cold');
  const bridged = planAct({ state: { interest: 0.6, turn: 4, lastTopicTurn: 1 }, voice, rng: rng(2), agenda: gated, thread: { theirs: 'my flatmate smokes on the balcony and the whole place smells' } });
  assert.deepEqual([bridged.topic?.id, bridged.topic?.how], ['d1', 'bridge']);
});

test('topics in the flow: a tried topic comes back only through a bridge, and only TOPIC_TRIES times', () => {
  const lull = { theirs: 'lol yeah' };
  const once = { interest: 0.6, turn: 6, lastTopicTurn: 2, topicTries: { a1: 1 } };
  assert.notEqual(planAct({ state: once, voice, rng: rng(3), agenda: flowAgenda.slice(0, 1), thread: lull }).topic?.id, 'a1');
  assert.equal(planAct({ state: once, voice, rng: rng(3), agenda: flowAgenda, thread: toBar }).topic?.id, 'a1');
  assert.notEqual(planAct({ state: { ...once, topicTries: { a1: KG.TOPIC_TRIES } }, voice, rng: rng(3), agenda: flowAgenda, thread: toBar }).topic?.id, 'a1');
  assert.notEqual(planAct({ state: once, voice, rng: rng(3), agenda: [{ ...flowAgenda[0], status: 'answered' }], thread: toBar }).topic?.id, 'a1', 'answered');
});

test('bridgesTo: attribute word lists and, for other topics, their own words', () => {
  assert.equal(bridgesTo({ topic: 'wants children', attribute: 'kids' }, 'my nephew made me watch frozen 4 times'), true);
  assert.equal(bridgesTo({ topic: 'living in 3-5 years' }, 'i might move abroad for my masters'), true, 'topic label → attribute');
  assert.equal(bridgesTo({ topic: 'trekking' }, 'we trekked up to the fort'), true);
  assert.equal(bridgesTo({ topic: 'trekking' }, 'i love filter coffee'), false);
  assert.deepEqual(attributesIn('haha same! do you smoke, by the way?', { questions: true }), ['smoking']);
  assert.deepEqual(attributesIn('i love trekking. do you smoke?', { questions: false }), [], 'statements only');
});

test('questions: not every message; fewer right after they answered mine; a stall still gets one', () => {
  const rate = (state, thread = engaged) => { const r = rng(9); let n = 0; for (let i = 0; i < 400; i++) n += planAct({ state: { interest: 0.5, turn: 1, ...state }, voice, rng: r, thread }).askBack ? 1 : 0; return n / 400; };
  const fresh = rate({ lastAsked: false });
  const answered = rate({ lastAsked: true });
  assert.ok(fresh > 0.35 && fresh < 0.65, `ask-back ${fresh}`);
  assert.ok(answered < fresh - 0.1, `after my question was answered ${answered} vs ${fresh}`);
  assert.ok(rate({ lastAsked: false }, { theirs: 'ya same' }) === 1, 'short reply, nobody asked: keep it going');
});

test('moves: answer when asked; otherwise a mix of follow-ups, sharing and plain reactions', () => {
  assert.equal(planAct({ state: { interest: 0.5, turn: 1 }, voice, rng: rng(1), perception: { aboutMeQuestion: true }, thread: { theirs: 'what do you do on weekends?' } }).move, 'answer');
  const r = rng(4);
  const moves = new Set(Array.from({ length: 100 }, () => planAct({ state: { interest: 0.5, turn: 1, lastAsked: true }, voice, rng: r, thread: engaged }).move));
  assert.deepEqual([...moves].sort(), ['follow_up', 'react', 'share']);
});

test('natural end needs only the settled agenda and NATURAL_END_FROM (no forced direct questions)', () => {
  const agenda = [{ id: 'a2', topic: 'drinking', attribute: 'drinking', priority: 0.9, status: 'answered' }];
  const p = planAct({ state: { interest: 0.6, turn: 9, lastTopicTurn: 7 }, voice, perception: {}, rng: rng(1), agenda, msgCount: KG.NATURAL_END_FROM, agendaSettled: true });
  assert.deepEqual([p.end, p.topic, p.move], ['natural', null, 'end']);
  assert.equal(planAct({ state: { interest: 0.6, turn: 9 }, voice, rng: rng(1), agenda, msgCount: KG.NATURAL_END_FROM - 1, agendaSettled: true }).end, null);
});
