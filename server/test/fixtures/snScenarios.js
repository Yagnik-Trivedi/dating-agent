// Plan 31 (CONVO_MODE=sn must reproduce SN exactly): scripted chats replayed through planAct for fixed seeds. The plans
// SN produced on 2026-10-21 (before plan 31) are frozen in sn-plans.json; test/convoMode.test.js compares against them.
// Regenerate only on purpose: node test/fixtures/snScenarios.js --write
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rng } from '../../src/utils/rng.js';

const voices = [
  { wordCounts: [6, 8, 10, 12, 9], burstiness: 0.2, questionBackRate: 0.5, emojiPerMessage: 0.6, topEmojis: ['😄', '🔥'], laughRate: 0.5, laughForms: { haha: 0.7, lol: 0.3 }, language: { mix: { en: 0.7, hi_latn: 0.3 }, codeSwitchRate: 0.3, switchTriggers: ['tease'], mirrorsLanguage: 0.8 } },
  { wordCounts: [3, 4, 5], burstiness: 0, questionBackRate: 0.1, emojiPerMessage: 0, laughRate: 0.1, laughForms: { lol: 1 }, language: { mix: { en: 1 } } },
];
const agendas = [
  [
    { id: 'a1', topic: 'smoking', attribute: 'smoking', dealbreaker: true, priority: 1, status: 'open' },
    { id: 'a2', topic: 'living in 3-5 years', attribute: 'location', priority: 0.9, status: 'open' },
    { id: 'a3', topic: 'wants children', attribute: 'kids', priority: 0.6, status: 'open' },
    { id: 'a4', topic: 'trekking', priority: 0.45, status: 'open' },
  ],
  [{ id: 'a1', topic: 'drinking', attribute: 'drinking', priority: 0.9, status: 'answered' }],
];
const stories = [[{ _id: 's1', object: 'got lost on the Rajmachi trek' }], []];
// Their message(s) per turn + what the read found.
const script = [
  { theirs: 'heyy how is your day going?', perception: { isQuestion: true, aboutMeQuestion: true } },
  { theirs: 'haha same, back to back classes and i am dead', perception: { humor: true, mood: 'tired' } },
  { theirs: 'ended up at a new brewery with friends after, so loud lol', perception: { concepts: [{ text: 'brewery', own: { strength: 0.4, polarity: 1 } }] } },
  { theirs: 'lol yeah', perception: { lowEffort: true } },
  { theirs: 'my flatmate smokes on the balcony and the whole place smells', perception: { conflicts: [{ text: 'smoking is fine', ownStrength: 0.9 }] } },
  { theirs: 'i might move abroad for my masters next year!!', perception: { mood: 'excited', language: { languages: ['en'] } } },
  { theirs: 'so basically my manager yelled at me today and i just sat there and took it, worst day', perception: { mood: 'down' } },
  { theirs: 'what do you do on weekends?', perception: { isQuestion: true, aboutMeQuestion: true } },
  { theirs: 'nice', perception: {} },
  { theirs: 'okay i should sleep, long day tomorrow', perception: { mood: 'closing' } },
];

/** Replays every scenario through planAct(args + extra), feeding state forward the way the engine does. */
export function runScenarios(planAct, extra = {}) {
  const out = [];
  for (const [vi, voice] of voices.entries()) {
    for (const [ai, agenda] of agendas.entries()) {
      for (const seed of [1, 2, 3, 7, 42]) {
        const r = rng(seed);
        let state = { interest: 0.55, lowInterestTurns: 0, turn: 0, topicsTouched: [] };
        let mine = null;
        const plans = [];
        for (const [turn, step] of script.entries()) {
          const p = planAct({ state, voice, perception: step.perception, rng: r, agenda, stories: stories[ai], msgCount: turn + 4, opening: false,
            agendaSettled: ai === 1, thread: { theirs: step.theirs, mine }, ...extra });
          plans.push(p);
          mine = p.askBack ? 'so what about you?' : 'haha nice';
          state = { ...state, turn: turn + 1, lastAsked: p.askBack, ...(p.topic && { lastTopicTurn: turn }),
            ...(p.topic?.kind === 'agenda' && { topicTries: { ...(state.topicTries ?? {}), [p.topic.id]: (state.topicTries?.[p.topic.id] ?? 0) + 1 } }),
            topicsTouched: [...state.topicsTouched, ...(p.topic ? [p.topic.id] : [])] };
        }
        out.push({ voice: vi, agenda: ai, seed, plans });
      }
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const { planAct } = await import('../../src/services/conversation/planAct.js');
  writeFileSync(new URL('./sn-plans.json', import.meta.url), `${JSON.stringify(runScenarios(planAct))}\n`);
  console.log('wrote test/fixtures/sn-plans.json');
}
