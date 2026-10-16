// Plan 05 §5 step 9: VoiceProfile distributions from fixed samples, incl. language mix and code-switching.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeVoiceProfile } from '../src/services/kg/voiceProfile.js';

const samples = [
  { incoming: 'hey! your profile made me smile', text: 'hahaha thanks yaar 😄', mood: 'greeting' },
  { incoming: 'so what do you do?', text: 'mostly design work tbh, and treks on weekends', mood: 'curious' },
  { incoming: 'pineapple on pizza?', text: 'noooo never!! pineapple pizza is a crime 😂', mood: 'opinion' },
  { incoming: 'ever done a trek?', text: 'arre yaar treks on weekends are my whole personality', mood: 'casual' },
  { incoming: 'anyway I should sleep', text: 'gn 👋', mood: 'closing' },
];

test('counts, rates and distributions', () => {
  const v = computeVoiceProfile(samples);
  assert.equal(v.sampleCount, 5);
  assert.deepEqual(v.wordCounts, [3, 8, 7, 9, 1]);
  assert.equal(v.questionBackRate, 0);
  assert.equal(v.emojiPerMessage, 0.6);
  assert.deepEqual(v.topEmojis.sort(), ['👋', '😂', '😄'].sort());
  assert.deepEqual(v.emojiPlacement, { end: 1, inline: 0 });
  assert.equal(v.laughRate, 0.2);
  assert.equal(v.laughForms.hahaha, 1);
  assert.deepEqual(v.abbrevs.sort(), ['gn', 'tbh']);
  assert.equal(v.lowercaseStartRatio, 1);
  assert.equal(v.doublePunctRate, 0.2);
  assert.equal(v.elongationRate, 0.2);
  assert.equal(v.endings.emoji, 0.6);
  assert.ok(v.petPhrases.includes('treks on weekends'), v.petPhrases.join(', '));
  assert.equal(v.closingStyle, 'gn 👋');
});

test('language mix, code-switch rate, triggers and mirroring prior', () => {
  const v = computeVoiceProfile(samples);
  assert.ok(v.language.mix.en > v.language.mix.hi_latn && v.language.mix.hi_latn > 0, JSON.stringify(v.language.mix));
  assert.equal(v.language.codeSwitchRate, 0.4);
  assert.deepEqual(v.language.switchTriggers.sort(), ['casual', 'greeting']);
  assert.equal(v.language.mirrorsLanguage, 0.5, 'English incoming to an English-dominant user says nothing: prior');
  const hindiFirst = computeVoiceProfile([
    { incoming: 'how was your day?', text: 'it was good, thanks' },
    { incoming: 'kya kar rahe ho yaar', text: 'kuch nahi yaar, bas chill' },
    { incoming: 'arre kya scene hai', text: 'bas yaar mast hai sab' },
    { incoming: 'bhai kal kya plan hai', text: 'kal pakka trek hai yaar' },
  ]);
  assert.ok(hindiFirst.language.mix.hi_latn > 0.5);
  assert.ok(hindiFirst.language.mirrorsLanguage > 0.5, 'answered the English message in English');
});

test('recency weights shift rates toward newer samples', () => {
  const old = { text: 'Hello. How are you?', weight: 0.1 };
  const recent = { text: 'heyy whats up', weight: 1 };
  assert.ok(computeVoiceProfile([old, recent]).lowercaseStartRatio > 0.85);
});
