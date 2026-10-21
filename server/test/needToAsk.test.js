// Plan 31 A3: "Do I even need to ask this?" before the chat, code only. Gate-checked → known (gate); shown on their
// profile → known (profile); below "very important" → removed; humans-only, "leave for me", private or hidden → for you;
// what's left (0–2 items) → ask once. Interests stay talk material.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addClarify, buildAgenda, needToAsk } from '../src/services/brief/buildBrief.js';

const fact = (attribute, value, importance, extra = {}) => ({ predicate: 'values', attribute, value, object: `${attribute}: ${value}`, importance, disclosure: 'public', ...extra });
// Arya (plan 31 A3 example): kids very important, smoking a dealbreaker, diet nice to have, where you'll live very important.
const arya = [
  fact('kids', 'yes', 0.9), fact('smoking', 'never', 1, { isDealbreaker: true, predicate: 'lifestyle' }), fact('diet', 'veg', 0.3, { predicate: 'lifestyle' }),
  fact('location', 'abroad', 0.9, { predicate: 'goal' }), fact('family', 'closely', 0.6),
  { predicate: 'likes', object: 'trekking', strength: 0.9, disclosure: 'public' },
];
const theirs = { wantsKids: 'yes', lifestyle: { smoking: 'never' } };
const byTopic = (agenda) => Object.fromEntries(agenda.map((a) => [a.attribute ?? a.topic, a]));

test('the A3 example: kids on their profile, smoking gate-checked, diet removed, only "where you\'ll live" may be asked once', () => {
  const a = byTopic(buildAgenda({ self: arya, need: { theirTags: theirs, gateDealbreakers: ['smoking'] } }));
  assert.deepEqual([a.kids.status, a.kids.settledBy, a.kids.profileValue, a.kids.differs], ['answered', 'profile', 'yes', false]);
  assert.deepEqual([a.smoking.status, a.smoking.settledBy], ['answered', 'gate']);
  assert.equal(a.diet, undefined, 'nice to have: removed');
  assert.equal(a.family, undefined, 'medium importance: removed');
  assert.equal(a.location.askOnce, true);
  assert.equal(a.trekking.kind, 'interest');
  assert.ok(!a.trekking.askOnce, 'an interest is talk material, never a question to tick off');
  assert.equal(Object.values(a).filter((x) => x.askOnce).length, 1);
});

test('kids: shown on their profile → known; not shown (hidden or skipped) → for you; never asked either way', () => {
  const shown = byTopic(needToAsk([{ id: 'a1', topic: 'wants children', attribute: 'kids', priority: 0.9, status: 'open', value: 'yes' }], { theirTags: { wantsKids: 'no' } }));
  assert.deepEqual([shown.kids.settledBy, shown.kids.differs], ['profile', true]);
  const hidden = byTopic(needToAsk([{ id: 'a1', topic: 'wants children', attribute: 'kids', priority: 0.9, status: 'open' }], { theirTags: {} }));
  assert.equal(hidden.kids.status, 'for_you');
  assert.ok(!hidden.kids.askOnce);
});

test('"leave for me", humans-only topics, my private/if_asked or hidden basics → for you', () => {
  const item = (attribute, topic) => ({ id: 'a1', topic, attribute, priority: 0.9, status: 'open' });
  assert.equal(needToAsk([item('location', 'living in 3-5 years')], { leaveForMe: ['location'] })[0].status, 'for_you');
  assert.equal(needToAsk([item(undefined, 'past relationships')], {})[0].status, 'for_you');
  assert.equal(needToAsk([item('looking_for', 'looking for')], {})[0].status, 'for_you', 'where this is going: for the humans');
  assert.equal(needToAsk([item('family', 'family involvement in relationship decisions')], { myPrivateTopics: ['family'] })[0].status, 'for_you');
  assert.equal(needToAsk([item('career', 'career ambition')], {})[0].askOnce, true, 'a very important non-basic item');
});

test('answered items stay in the agenda outside the size cap; clarify topics join the talk items; ids stay unique', () => {
  const many = [...arya, ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((x) => ({ predicate: 'likes', object: `hobby ${x}`, strength: 0.8, disclosure: 'public' }))];
  const agenda = buildAgenda({ self: many, need: { theirTags: theirs, gateDealbreakers: ['smoking'] } });
  assert.ok(agenda.find((a) => a.settledBy === 'gate') && agenda.find((a) => a.settledBy === 'profile'));
  assert.ok(agenda.filter((a) => a.status !== 'answered' && a.status !== 'for_you').length <= 8);
  const withClarify = addClarify(agenda, { contradictions: [{ topic: 'job', severity: 1 }] });
  assert.ok(withClarify.find((a) => a.settledBy === 'gate'), 'gate-settled kept after addClarify');
  assert.equal(withClarify.find((a) => a.topic === 'job')?.kind, 'clarify');
  assert.equal(new Set(withClarify.map((a) => a.id)).size, withClarify.length);
});

test('without need (CONVO_MODE=sn) the agenda is exactly the SN agenda', () => {
  const sn = buildAgenda({ self: arya });
  assert.deepEqual(sn.map((a) => [a.topic, a.priority, a.status]), [['smoking', 1, 'open'], ['wants children', 0.9, 'open'], ['living in 3-5 years', 0.9, 'open'], ['family involvement in relationship decisions', 0.6, 'open'], ['trekking', 0.45, 'open'], ['diet', 0.3, 'open']]);
  assert.ok(sn.every((a) => !a.settledBy && !a.askOnce));
});
