// Plan 05 §1 (F34): language heuristics.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hinglishCount, tagLanguageHeuristic, tokensOf } from '../src/services/kg/language.js';

test('ambiguous short words only count next to a clear Hindi word; "scene" is English', () => {
  assert.equal(hinglishCount(tokensOf('ye na, hum tum')), 0);
  assert.equal(hinglishCount(tokensOf('what a scene')), 0);
  assert.equal(hinglishCount(tokensOf('arre yaar ye toh mast hai na')), 7); // arre yaar mast hai + ye toh na
});

test('heuristic tags scripts, mixes and code-switching', () => {
  assert.deepEqual(tagLanguageHeuristic('haha sounds fun!'), { languages: ['en'], script: 'latin', codeSwitch: false, shares: { en: 1 } });
  const hi = tagLanguageHeuristic('arre yaar that was so good');
  assert.ok(hi.languages.includes('hi_latn') && hi.languages.includes('en') && hi.codeSwitch);
  assert.equal(tagLanguageHeuristic('बहुत बढ़िया').script, 'devanagari');
  assert.equal(tagLanguageHeuristic('बहुत nice yaar').script, 'mixed');
  assert.ok(tagLanguageHeuristic('kem cho, shu kare che?').languages.includes('gu_latn'));
});

test('romanised Tamil and Marathi are tagged (plan 11 personas)', () => {
  assert.deepEqual(tagLanguageHeuristic('romba nice da, enakku filter coffee is life').languages.sort(), ['en', 'ta_latn']);
  assert.deepEqual(tagLanguageHeuristic('khup majja aali yesterday, trek was amazing').languages.sort(), ['en', 'mr_latn']);
  assert.deepEqual(tagLanguageHeuristic('see you at the gym tomorrow').languages, ['en']);
});
