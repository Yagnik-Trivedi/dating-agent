// Plan 08: traitRules, updateInterest, planAct (stance, low interest → shorter + end, replay), reply language.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateInterest } from '../src/services/conversation/interest.js';
import { pickLanguage, planAct } from '../src/services/conversation/planAct.js';
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

test('steering: after the warm-up, every other turn names my next open agenda topic', () => {
  const agenda = [{ id: 'a1', topic: 'kids', priority: 1, status: 'open' }, { id: 'a2', topic: 'smoking', priority: 0.6, status: 'open' }];
  const quiet = { ...voice };
  const r = rng(5);
  let state = { interest: 0.5, turn: 0, topicsTouched: [] };
  const topics = [];
  for (let turn = 0; turn < 6; turn++) {
    state = { ...state, turn };
    const p = planAct({ state, voice: quiet, rng: r, agenda });
    topics.push(p.topic?.id ?? null);
    if (p.topic) state = { ...state, lastTopicTurn: turn, topicsTouched: [...state.topicsTouched, p.topic.id] };
  }
  assert.equal(topics[2], 'a1', 'first steer right after the warm-up');
  assert.ok(topics.includes('a2'), `the next topic follows: ${topics.join(',')}`);
});

test('steering retries an important unanswered topic, but not a minor one', () => {
  const agenda = [{ id: 'a1', topic: 'smoking', priority: 0.9, status: 'open' }, { id: 'a2', topic: 'board games', priority: 0.3, status: 'open' }];
  const base = { interest: 0.5, turn: 4, lastTopicTurn: 0 };
  const once = planAct({ state: { ...base, topicTries: { a1: 1 }, topicsTouched: ['a1'] }, voice, perception: {}, rng: rng(3), agenda });
  assert.equal(once.topic?.id, 'a1', 'tried once and still open → steer to it again');
  const twice = planAct({ state: { ...base, topicTries: { a1: 2, a2: 1 }, topicsTouched: ['a1', 'a2'] }, voice, perception: {}, rng: rng(3), agenda });
  assert.notEqual(twice.topic?.id, 'a1', 'after STEER_TRIES, give up');
  assert.notEqual(twice.topic?.id, 'a2', 'a minor topic is tried once');
});
