// Plan 32 KP1 (A6.9): how you text. The self-report beats what desktop typing shows; bursts come from the self-report
// and real own-chat bursts (never line breaks); the agent only uses my own emoji; a burst goes out as separate bubbles.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { VoiceSample } from '../src/models/VoiceSample.js';
import { planAct } from '../src/services/conversation/planAct.js';
import { KG } from '../src/services/kg/config.js';
import { learnOwnMessage } from '../src/services/kg/ownVoice.js';
import { textingStyleSchema } from '../src/services/kg/textingStyle.js';
import { computeVoiceProfile } from '../src/services/kg/voiceProfile.js';
import { ownEmojiOnly, splitBurst } from '../src/services/persona/text.js';
import { rng } from '../src/utils/rng.js';
import { start, stop } from '../scripts/lib/testDb.js';

// A user who did onboarding on a laptop: plain, emoji-free, longish replies, no line breaks.
const desktop = [
  { incoming: 'hey! your profile made me smile 😄', text: 'Thanks, that is really kind of you to say. Yours was nice too.' },
  { incoming: 'so what do you do?', text: 'I work in product design at a startup and I really like it most days.' },
  { incoming: 'pineapple on pizza?', text: 'Honestly yes, I think it works well with something spicy on top.' },
  { incoming: 'ever done a trek?', text: 'A few in the Sahyadris, Rajmachi was my favourite one so far.' },
  { incoming: 'sorry for the late reply', text: 'No worries at all, it happens to everyone.' },
].map((s) => ({ ...s, device: 'desktop' }));
const report = { emoji: 'a_lot', bursts: 'several', length: 'short', caps: 'lowercase' };

test('the texting card schema: any subset of the listed answers, nothing else', () => {
  assert.deepEqual(textingStyleSchema.parse({ emoji: 'a_lot' }), { emoji: 'a_lot' });
  assert.throws(() => textingStyleSchema.parse({ emoji: 'tons' }));
  assert.throws(() => textingStyleSchema.parse({ mood: 'happy' }));
});

test('desktop-only user who reports "a lot" of emoji and "several short messages": the self-report wins', () => {
  const plain = computeVoiceProfile(desktop);
  const v = computeVoiceProfile(desktop, { selfReport: report });
  assert.equal(plain.emojiPerMessage, 0);
  assert.ok(v.emojiPerMessage >= 0.8, `emoji ${v.emojiPerMessage}`);
  assert.ok(v.topEmojis.length > 0, 'reported emoji but none of their own → defaults');
  assert.deepEqual(v.topEmojis, [...KG.DEFAULT_EMOJIS]);
  assert.ok(plain.burstiness <= KG.BURST_PRIOR && v.burstiness >= 0.5, `bursts ${plain.burstiness} → ${v.burstiness}`);
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  assert.ok(median(v.wordCounts) < median(plain.wordCounts), `length ${median(plain.wordCounts)} → ${median(v.wordCounts)}`);
  // Capitals count fully (wording), so 5 capitalised replies vs the report land in between, pulled toward lowercase.
  assert.ok(plain.lowercaseStartRatio === 0 && v.lowercaseStartRatio >= 0.3, `lowercase ${v.lowercaseStartRatio}`);
  assert.deepEqual(v.selfReport, report);
  assert.deepEqual(v.devices, { mobile: 0, desktop: 5, unknown: 0 });
});

test('desktop samples count less for emoji and length than phone samples; wording and language count fully', () => {
  const phone = desktop.map((s) => ({ ...s, device: 'mobile' }));
  const withEmoji = (xs) => xs.map((s, i) => (i < 2 ? { ...s, text: `${s.text} 😂` } : s));
  const d = computeVoiceProfile(withEmoji(desktop), { selfReport: { emoji: 'rarely' } });
  const m = computeVoiceProfile(withEmoji(phone), { selfReport: { emoji: 'rarely' } });
  assert.ok(m.emojiPerMessage > d.emojiPerMessage, `phone ${m.emojiPerMessage} vs desktop ${d.emojiPerMessage}`);
  assert.deepEqual(d.language.mix, m.language.mix);
  assert.deepEqual(d.petPhrases, m.petPhrases);
});

test('a line break inside one text box is not a burst; real own-chat bursts are', () => {
  assert.equal(computeVoiceProfile([{ text: 'haha yes\nso fun' }, { text: 'ok\nsure' }]).burstiness, KG.BURST_PRIOR);
  const chats = Array.from({ length: 20 }, (_, i) => ({ text: `msg ${i} haha`, source: 'own_chat', burst: i % 2 === 1 })); // every reply = 2 messages
  assert.ok(computeVoiceProfile(chats).burstiness > 0.7);
});

test('emoji: never one echoed from the incoming message, a thing emoji only from 2+ samples, sad ones kept apart', () => {
  const v = computeVoiceProfile([
    { incoming: 'hey! your profile made me smile 😄', text: 'haha thanks 😄' },
    { incoming: 'pineapple on pizza?', text: 'yesss 🍍' },
    { incoming: 'sorry, crazy day', text: 'no worries 😞' },
    { text: 'lol same 😂' },
  ]);
  assert.deepEqual(v.topEmojis, ['😂']);
  assert.deepEqual(v.sadEmojis, ['😞']);
  assert.ok(computeVoiceProfile([{ text: 'mango season 🥭' }, { text: 'more mango 🥭' }]).topEmojis.includes('🥭'));
});

test('planAct (human): a sad emoji only when they are down; the plan never picks an emoji that is not mine', () => {
  const voice = { wordCounts: [6, 8], emojiPerMessage: 1, topEmojis: ['😂'], sadEmojis: ['😞'], language: { mix: { en: 1 } } };
  const plans = (theirs) => Array.from({ length: 100 }, (_, i) => planAct({ mode: 'human', voice, rng: rng(i + 1), agenda: [], msgCount: 4, thread: { theirs }, state: { interest: 0.6, turn: 3 } }));
  const cheerful = plans('haha that sounds like a fun plan').map((p) => p.emoji).filter(Boolean);
  assert.ok(cheerful.length && cheerful.every((e) => e === '😂'));
  assert.ok(plans('honestly worst day, my manager yelled at me').some((p) => p.emoji === '😞'));
  assert.equal(ownEmojiOnly('haha yes 🍍 so good 😂!', new Set(['😂'])), 'haha yes so good 😂!');
});

test('a "several short messages" user gets two bubbles at roughly their rate in a seeded run', () => {
  const v = computeVoiceProfile(desktop, { selfReport: report });
  const voice = { ...v, questionBackRate: 0.3 };
  const n = 400;
  const bursts = Array.from({ length: n }, (_, i) => planAct({ mode: 'human', voice, rng: rng(i + 1), agenda: [], msgCount: 4, thread: { theirs: 'haha yeah that was such a fun weekend honestly' }, state: { interest: 0.6, turn: 3 } }))
    .filter((p) => p.burst === 2).length / n;
  assert.ok(Math.abs(bursts - v.burstiness) < 0.08, `burst rate ${bursts} vs burstiness ${v.burstiness}`);
  // …and a burst plan goes out as separate messages, split between sentences (a trailing emoji stays with its sentence).
  assert.deepEqual(splitBurst(['haha same! did hampta last year 😂 how was yours?'], 2), ['haha same!', 'did hampta last year 😂 how was yours?']);
  assert.deepEqual(splitBurst(['just one sentence here'], 2), ['just one sentence here']);
  assert.deepEqual(splitBurst(['a. b.'], 1), ['a. b.']);
  assert.deepEqual(splitBurst(['one.', 'two.'], 2), ['one.', 'two.'], 'already two messages');
});

before(start);
after(stop);

test('own chats: a message right after my own (nothing from them in between) is stored as a burst', async () => {
  const [me, them] = await User.create([
    { email: 'ts-a@t.local', passwordHash: 'x', name: 'A', consentAgent: true, consentAt: new Date() },
    { email: 'ts-b@t.local', passwordHash: 'x', name: 'B', consentAgent: true, consentAt: new Date() },
  ]);
  const matchId = new mongoose.Types.ObjectId();
  const handedOff = { _id: matchId, status: 'handed_off' };
  await Message.create({ matchId, senderId: them._id, authoredBy: 'human', text: 'so how was the trek?' });
  const first = await Message.create({ matchId, senderId: me._id, authoredBy: 'human', text: 'omg so good' });
  await learnOwnMessage(first, handedOff);
  const second = await Message.create({ matchId, senderId: me._id, authoredBy: 'human', text: 'legs are dead though' });
  await learnOwnMessage(second, handedOff);
  const samples = await VoiceSample.find({ userId: me._id }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(samples.map((s) => [s.text, s.burst]), [['omg so good', false], ['legs are dead though', true]]);
});
