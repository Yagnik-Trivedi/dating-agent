// Plan 08: styleCheck, groundingCheck (incl. claims about the other person), leakCheck.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groundingCheck, hedgeSentences, leakCheck, styleCheck } from '../src/services/persona/checks.js';

const plan = { targetWords: 10, burst: 1, askBack: true, language: { primary: 'en', codeSwitch: false } };

test('styleCheck: length, one question, never-say, emoji, language, echo', () => {
  assert.deepEqual(styleCheck('haha yes i love that trail, which one did you do?', plan, { language: { mix: { en: 1 } } }), []);
  assert.ok(styleCheck(`${'word '.repeat(40)}`, plan).some((p) => p.startsWith('too long')));
  assert.ok(styleCheck('really? are you sure?', plan).includes('more than one question'));
  assert.ok(styleCheck('great 😄', { ...plan, targetWords: 2 }, { neverSay: ['emoji'] }).some((p) => p.includes('emoji')));
  assert.ok(styleCheck('arre yaar that was fun', plan, { language: { mix: { en: 1 } } }).some((p) => p.includes('Hindi')));
  assert.ok(styleCheck('arre yaar that was fun', plan, { language: { mix: { en: 0.7, hi_latn: 0.3 } } }).some((p) => p.includes('English only')));
  assert.deepEqual(styleCheck('arre yaar that was fun', { ...plan, language: { primary: 'hi_latn', codeSwitch: true } }, { language: { mix: { en: 0.7, hi_latn: 0.3 } } }), []);
  assert.ok(styleCheck('the sunrise over the valley was unreal today', plan, {}, ['wow the sunrise over the valley was unreal']).some((p) => p.includes('repeats')));
});

const facts = new Map([
  ['F1', { predicate: 'likes', object: 'trekking', polarity: 1 }],
  ['F2', { predicate: 'dislikes', object: 'crowded clubs', polarity: 1 }],
]);

test('groundingCheck: every "I…" claim needs a valid fact with the right stance', () => {
  const ok = groundingCheck({ text: 'i do sinhagad most weekends. which trail do you like?', claims: [{ text: 'i do sinhagad most weekends', factIds: ['F1'], stance: 'positive' }], facts });
  assert.deepEqual(ok.problems, []);
  const missing = groundingCheck({ text: 'i play the guitar every night.', claims: [], facts });
  assert.ok(missing.problems.length && missing.drop.includes('i play the guitar every night.'));
  const badId = groundingCheck({ text: 'i love trekking.', claims: [{ text: 'i love trekking', factIds: ['F9'], stance: 'positive' }], facts });
  assert.ok(badId.problems.some((p) => p.includes('unknown facts')));
  const contra = groundingCheck({ text: 'i love crowded clubs.', claims: [{ text: 'i love crowded clubs', factIds: ['F2'], stance: 'positive' }], facts });
  assert.ok(contra.problems.some((p) => p.includes('contradicts')));
  assert.deepEqual(groundingCheck({ text: "haha i love that! i'm so glad you said that.", facts }).problems, [], 'reactions are not claims');
});

test('groundingCheck: statements about THEM need my notes, their profile or their own words (v1 failures)', () => {
  const theirTexts = ['hey! just got back from a long run on marine drive'];
  const arch = groundingCheck({ text: "i noticed you're into architecture, love that.", facts, theirTexts });
  assert.ok(arch.problems.some((p) => p.includes('nobody said')), 'v1: attributed my interest (architecture) to them');
  const pic = groundingCheck({ text: 'love the trekking pic on your profile.', facts, theirTexts });
  assert.ok(pic.problems.some((p) => p.includes('nobody said')), 'v1: a photo they never posted');
  assert.deepEqual(groundingCheck({ text: 'your run on marine drive sounds amazing.', facts, theirTexts }).problems, [], 'reacting to their words is fine');
  const noted = groundingCheck({ text: 'you mentioned you bake on sundays.', aboutThem: [{ text: 'you bake on sundays', sourceIds: ['N1'] }], facts, sources: new Set(['N1']), theirTexts });
  assert.deepEqual(noted.problems, []);
});

test('leakCheck: keyword path and embedding path', () => {
  const priv = [{ object: 'recovering from a hard breakup last spring', vector: [1, 0, 0] }];
  assert.equal(leakCheck(['honestly still recovering from that breakup'], priv).length, 1);
  assert.equal(leakCheck(['trekking this weekend!'], priv).length, 0);
  assert.equal(leakCheck(['things have been rough lately'], priv, [[0.99, 0.1, 0]]).length, 1, 'semantic leak via embeddings');
  assert.equal(leakCheck(['things have been rough lately'], priv, [[0, 1, 0]]).length, 0);
});

test('honest uncertainty needs no fact ("never tried it", "not sure")', () => {
  const r = groundingCheck({ text: "i've never tried poha but it sounds cozy.", claims: [{ text: "i've never tried poha", factIds: [], stance: 'neutral' }], facts });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(groundingCheck({ text: "honestly i'm not sure, haven't really thought about it.", facts }).problems, []);
});

test('reordered mirroring and meeting plans are hard problems (first v2 run)', () => {
  const echo = styleCheck('sinhagad sunrise trek then misal after, love that', plan, {}, ['haha sunrise trek to sinhagad then misal after? perfect sunday']);
  assert.ok(echo.some((p) => p.startsWith('mirrors')));
  assert.ok(styleCheck('love that plan, what time you thinking?', plan).some((p) => p.includes('real-world plans')));
  assert.ok(styleCheck('around 6am for the trek works', plan).some((p) => p.includes('real-world plans')));
  assert.deepEqual(styleCheck('rajmachi in the monsoon is my favourite, so green', plan, {}, ['have you done any monsoon treks?']), []);
});

test('"never tried X" is a contradiction when I like X', () => {
  const r = groundingCheck({ text: 'never tried trekking but sounds fun.', claims: [{ text: 'never tried trekking', factIds: [], stance: 'neutral' }], facts, myLikes: ['trekking'] });
  assert.ok(r.problems.some((p) => p.includes('you like trekking')) && r.drop.length === 1);
  assert.deepEqual(groundingCheck({ text: 'never tried pottery but sounds fun.', facts, myLikes: ['trekking'] }).problems, []);
});

test('curly apostrophes count as straight ones', () => {
  assert.deepEqual(groundingCheck({ text: 'haven’t tried pottery yet.', claims: [{ text: 'haven’t tried pottery', factIds: [], stance: 'neutral' }], facts }).problems, []);
});

test('an invented clause is caught even when the rest of the sentence is grounded', () => {
  const r = groundingCheck({
    text: 'drawing has been with me since i was a kid — i do sinhagad most weekends, which trail do you like?',
    claims: [{ text: 'i do sinhagad most weekends', factIds: ['F1'], stance: 'positive' }], facts,
  });
  assert.ok(r.unsupported.some((c) => c.includes('since i was a kid')) && r.drop.length === 1);
});

test('style: a draft opening like a recent message is rejected', () => {
  const plan = { targetWords: 12, burst: 1, language: { primary: 'hi_latn', codeSwitch: true } };
  const voice = { language: { mix: { en: 0.7, hi_latn: 0.3 } } };
  assert.ok(!styleCheck('Arre yaar, startup life sounds fun', plan, voice, ['Arre yaar, CrossFit and comedy nights?']).some((x) => x.startsWith('starts like')), 'a second time is fine');
  const p = styleCheck('Arre yaar, startup life sounds fun', plan, voice, ['Arre yaar, CrossFit and comedy nights?', 'hmm', 'Arre yaar, kya scene hai?']);
  assert.ok(p.some((x) => x.startsWith('starts like a recent message')), p.join('; '));
  assert.ok(!styleCheck('haha startup life sounds fun', plan, voice, ['Arre yaar, CrossFit?']).some((x) => x.startsWith('starts like')));
});

test('hedges are detected so the question goes to my human', () => {
  assert.equal(hedgeSentences("i don't follow IPL much but i love a good match haha").length, 1);
  assert.equal(hedgeSentences('haven’t tried that yet!').length, 1);
  assert.equal(hedgeSentences('i love trekking on weekends').length, 0);
});

test('grounding: answering a question about me, a clause without "I" still needs a fact', () => {
  const facts = new Map();
  const g = groundingCheck({ text: 'haha cheering for rcb! do you smoke?', facts, answering: true });
  assert.ok(g.unsupported.some((c) => /rcb/i.test(c)), JSON.stringify(g));
  assert.equal(groundingCheck({ text: 'haha cheering for rcb! do you smoke?', facts }).unsupported.length, 0, 'not answering: no claim');
});

test('style: the instruction wording leaking into a message is rejected', () => {
  const plan = { targetWords: 12, burst: 1, language: { primary: 'en' } };
  assert.ok(styleCheck('reacting to your indie music talk, gardening too?', plan, {}, []).some((p) => p.startsWith('talks about the instructions')));
  assert.ok(!styleCheck('love indie music! any gigs lately?', plan, {}, []).some((p) => p.startsWith('talks about the instructions')));
});

test('grounding: being unsure about a combination of things I like is honest; denying a like is not', () => {
  const facts = new Map();
  const myLikes = ['trekking', 'sketching'];
  assert.deepEqual(groundingCheck({ text: 'not sure about trekking and sketching together, never really thought about it', facts, myLikes }).problems, []);
  assert.ok(groundingCheck({ text: "i've never tried trekking", facts, myLikes }).problems.length, 'a like denied');
  assert.deepEqual(groundingCheck({ text: 'i saw you enjoy trekking', facts, sources: new Set(['P1']), aboutThem: [{ text: 'you enjoy trekking', sourceIds: ['P1'] }] }).unsupported, [], '"I saw you…" is about them');
});
